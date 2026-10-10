// Brings studies stored by older releases up to the current media format. It
// runs once in the background after start-up and finds nothing left to do on
// later starts. Replacements are committed before anything old is removed.
use super::*;

/// Every MPR slice PNG; the file header tells which ones are still RGBA.
const SLICE_PNG_QUERY: &str = "SELECT id, storage_key, COALESCE(size_bytes, 0)
     FROM anatomy_zone_modality_assets
     WHERE asset_kind = 'derived_slice' AND storage_key LIKE '%.png' AND id > $1
     ORDER BY id
     LIMIT 200";

impl PlaygroundService {
    pub async fn upgrade_legacy_media(&self) {
        // One runner, even if two API processes overlap during a deploy.
        let Ok(mut lock) = self.pool.acquire().await else {
            return;
        };
        let locked: bool =
            sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtext('anatomy.media_upgrade'))")
                .fetch_one(&mut *lock)
                .await
                .unwrap_or(false);
        if !locked {
            return;
        }

        match self.rebuild_legacy_atlases().await {
            Ok(0) => {}
            Ok(count) => tracing::info!(count, "rebuilt legacy PNG atlas pages as AVIF"),
            Err(error) => tracing::warn!(%error, "legacy atlas upgrade stopped"),
        }
        match self.recompress_legacy_slices().await {
            Ok(0) => {}
            Ok(count) => tracing::info!(count, "recompressed legacy MPR slice PNGs"),
            Err(error) => tracing::warn!(%error, "legacy slice upgrade stopped"),
        }

        let _ = sqlx::query("SELECT pg_advisory_unlock(hashtext('anatomy.media_upgrade'))")
            .execute(&mut *lock)
            .await;
    }

    /// Finished studies with PNG atlas pages, or PNG slices and no pages at all
    /// (a rebuild that never finished), get their pages rebuilt as AVIF.
    async fn rebuild_legacy_atlases(&self) -> Result<usize, AppError> {
        let modalities: Vec<(Uuid, Uuid, Uuid, String)> = sqlx::query_as(
            "SELECT DISTINCT ON (modality.id)
                 zone.account_id, zone.id, modality.id, asset.created_by_user_id
             FROM anatomy_zone_modality_assets AS asset
             INNER JOIN anatomy_zone_modalities AS modality ON modality.id = asset.modality_id
             INNER JOIN anatomy_zones AS zone ON zone.id = modality.zone_id
             WHERE modality.processing_status = 'ready'
               AND asset.storage_key LIKE '%.png'
               AND (asset.asset_kind = 'atlas'
                 OR (asset.asset_kind = 'derived_slice' AND NOT EXISTS (
                   SELECT 1 FROM anatomy_zone_modality_assets AS atlas
                   WHERE atlas.modality_id = modality.id AND atlas.asset_kind = 'atlas')))
             ORDER BY modality.id",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut rebuilt = 0;
        for (account_id, zone_id, modality_id, user_id) in &modalities {
            let assets = self
                .list_zone_modality_assets(*account_id, *zone_id, *modality_id)
                .await?;
            match self
                .rebuild_modality_atlases(
                    *account_id,
                    *zone_id,
                    *modality_id,
                    user_id,
                    &assets.items,
                )
                .await
            {
                Ok(_) => rebuilt += 1,
                Err(error) => tracing::warn!(%modality_id, %error, "atlas rebuild failed"),
            }
        }

        Ok(rebuilt)
    }

    /// Re-encodes old MPR slice PNGs losslessly. A file is replaced only when
    /// every pixel decodes identically.
    async fn recompress_legacy_slices(&self) -> Result<usize, AppError> {
        let mut after = Uuid::nil();
        let mut recompressed = 0;
        let mut missing = 0;

        loop {
            let rows: Vec<(Uuid, String, i64)> = sqlx::query_as(SLICE_PNG_QUERY)
                .bind(after)
                .fetch_all(&self.pool)
                .await?;
            let Some(last) = rows.last() else {
                break;
            };
            after = last.0;

            for (asset_id, storage_key, stored_size) in rows {
                let path = self.storage_root.join(&storage_key);
                let outcome =
                    tokio::task::spawn_blocking(move || upgrade_slice_file(&path, stored_size))
                        .await
                        .map_err(|error| {
                            AppError::internal(format!("Slice task failed: {error}"))
                        })?;
                match outcome {
                    Ok(Some((checksum, size))) => {
                        sqlx::query(
                            "UPDATE anatomy_zone_modality_assets
                             SET checksum = $2, size_bytes = $3, updated_at = NOW()
                             WHERE id = $1",
                        )
                        .bind(asset_id)
                        .bind(checksum)
                        .bind(size)
                        .execute(&self.pool)
                        .await?;
                        recompressed += 1;
                    }
                    Ok(None) => {}
                    Err(error)
                        if error
                            .downcast_ref::<std::io::Error>()
                            .is_some_and(|io| io.kind() == std::io::ErrorKind::NotFound) =>
                    {
                        missing += 1;
                    }
                    Err(error) => tracing::warn!(%asset_id, %error, "slice left unchanged"),
                }
            }
        }

        if missing > 0 {
            tracing::warn!(missing, "MPR slice files are missing on disk");
        }
        Ok(recompressed)
    }
}

/// Returns the checksum and size to store when the database needs updating.
fn upgrade_slice_file(path: &Path, stored_size: i64) -> anyhow::Result<Option<(String, i64)>> {
    if let Some(upgraded) = recompress_png_losslessly(path)? {
        return Ok(Some(upgraded));
    }
    // A stop between the rename and the database update leaves a stale size.
    let size = std::fs::metadata(path)?.len() as i64;
    if size == stored_size {
        return Ok(None);
    }
    let bytes = std::fs::read(path)?;
    Ok(Some((sha256_hex(&bytes), bytes.len() as i64)))
}

/// Re-encodes an 8-bit RGB(A) PNG, which is how earlier releases wrote every
/// slice. Returns `None` when the file is already compact or would not shrink.
fn recompress_png_losslessly(path: &Path) -> anyhow::Result<Option<(String, i64)>> {
    let mut header = [0u8; 26];
    std::io::Read::read_exact(&mut std::fs::File::open(path)?, &mut header)?;
    // IHDR: byte 24 is the bit depth, byte 25 the colour type (2 RGB, 6 RGBA).
    if &header[12..16] != b"IHDR" || header[24] != 8 || !matches!(header[25], 2 | 6) {
        return Ok(None);
    }

    let before = std::fs::metadata(path)?;
    let original = std::fs::read(path)?;
    let pixels =
        image::load_from_memory_with_format(&original, image::ImageFormat::Png)?.to_rgba8();
    let encoded = encode_png(&pixels)?;
    if encoded.len() >= original.len() {
        return Ok(None);
    }
    let check = image::load_from_memory_with_format(&encoded, image::ImageFormat::Png)?.to_rgba8();
    if check.dimensions() != pixels.dimensions() || check.as_raw() != pixels.as_raw() {
        anyhow::bail!("re-encoded slice differs from the original");
    }

    let temporary = path.with_extension("png.upgrade");
    std::fs::write(&temporary, &encoded)?;
    // An edit that rewrote the slice meanwhile wins; ours is discarded.
    let current = std::fs::metadata(path)?;
    if current.len() != before.len() || current.modified()? != before.modified()? {
        let _ = std::fs::remove_file(&temporary);
        anyhow::bail!("slice changed while it was being re-encoded");
    }
    std::fs::rename(&temporary, path)?;

    Ok(Some((sha256_hex(&encoded), encoded.len() as i64)))
}

#[cfg(test)]
#[path = "media_upgrade_tests.rs"]
mod tests;
