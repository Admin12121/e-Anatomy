// Packs a reconstructed MPR study into a ZIP of lossless plane images, one
// folder per plane, for editing outside the site.
use std::io::Write;

use super::*;

const PLANES: [&str; 3] = ["axial", "coronal", "sagittal"];

impl PlaygroundService {
    /// Writes the ZIP to a temporary file and returns it with a download name.
    pub async fn export_modality_planes(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<(PathBuf, String), AppError> {
        // Atlas pages are a viewing cache; the export reads only the stored slices.
        let modality = self
            .repo
            .get_zone_modality_detail(&self.pool, account_id, zone_id, modality_id)
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))?;
        let spec = self
            .repo
            .get_modality_viewer_manifest_payload(&self.pool, modality_id)
            .await?
            .filter(|(schema_version, _)| schema_version == "mpr-1")
            .map(|(_, spec)| spec)
            .ok_or_else(|| {
                AppError::bad_request("Only MPR studies have all three planes to download.")
            })?;
        let assets = self
            .repo
            .list_zone_modality_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;
        let assets_by_id = assets
            .iter()
            .map(|asset| (asset.id.as_str(), asset))
            .collect::<BTreeMap<_, _>>();
        let spacing = spec["volume"]["spacing"]
            .as_array()
            .map(|axes| {
                axes.iter()
                    .filter_map(|axis| axis.as_f64())
                    .collect::<Vec<_>>()
            })
            .filter(|axes| axes.len() == 3)
            .unwrap_or_default();

        let mut entries = Vec::new();
        let mut planes = serde_json::Map::new();
        for plane in PLANES {
            let asset_ids = spec["planes"][plane]["assetIds"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            for (position, asset_id) in asset_ids.iter().enumerate() {
                let Some(asset) = asset_id.as_str().and_then(|id| assets_by_id.get(id)) else {
                    continue;
                };
                let storage_key = asset.storage_key.as_deref().ok_or_else(|| {
                    AppError::not_found("A slice of this study has no stored image.")
                })?;
                let number = asset.slice_index.map_or(position, |index| index as usize) + 1;
                // Library studies keep the lossless PNG beside the AVIF.
                entries.push((
                    format!("{plane}/{plane}_{number:04}.png"),
                    self.storage_root.join(storage_key).with_extension("png"),
                ));
            }
            let pixel_spacing = match (plane, spacing.as_slice()) {
                ("axial", [x, y, _]) => json!([x, y]),
                ("coronal", [x, _, z]) => json!([x, z]),
                ("sagittal", [_, y, z]) => json!([y, z]),
                _ => serde_json::Value::Null,
            };
            planes.insert(
                plane.to_string(),
                json!({ "count": asset_ids.len(), "pixelSpacingMm": pixel_spacing }),
            );
        }
        if entries.is_empty() {
            return Err(AppError::bad_request(
                "This study has no reconstructed planes yet.",
            ));
        }

        let summary = json!({
            "study": modality.name,
            "volume": spec["volume"],
            "planes": planes,
            "note": "Each image keeps one pixel per voxel. pixelSpacingMm gives the width and height of a pixel; where they differ, scale the image by that ratio to see its true shape.",
        });
        let temp_root = self.storage_root.join("playground").join("tmp");
        fs::create_dir_all(&temp_root)
            .await
            .map_err(|error| AppError::internal(format!("Unable to prepare export: {error}")))?;
        let path = temp_root.join(format!("planes-{}.zip", Uuid::new_v4()));
        let zip_path = path.clone();

        let written =
            tokio::task::spawn_blocking(move || write_planes_zip(&zip_path, &summary, &entries))
                .await
                .map_err(|error| AppError::internal(format!("Plane export failed: {error}")))
                .and_then(|result| {
                    result.map_err(|error| {
                        let missing = error.chain().any(|cause| {
                            cause
                                .downcast_ref::<std::io::Error>()
                                .is_some_and(|io| io.kind() == std::io::ErrorKind::NotFound)
                        });
                        if missing {
                            AppError::not_found(
                                "Some images of this study are missing on the server.",
                            )
                        } else {
                            AppError::internal(format!("Plane export failed: {error}"))
                        }
                    })
                });
        if let Err(error) = written {
            let _ = fs::remove_file(&path).await;
            return Err(error);
        }

        Ok((path, format!("{}-planes.zip", modality.slug)))
    }
}

fn write_planes_zip(
    path: &Path,
    summary: &serde_json::Value,
    entries: &[(String, PathBuf)],
) -> anyhow::Result<()> {
    let mut zip = zip::ZipWriter::new(std::fs::File::create(path)?);
    // PNG is already compressed.
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("manifest.json", options)?;
    zip.write_all(&serde_json::to_vec_pretty(summary)?)?;
    for (name, source) in entries {
        let mut image = std::fs::File::open(source)
            .with_context(|| format!("Slice image is missing: {}", source.display()))?;
        zip.start_file(name.as_str(), options)?;
        std::io::copy(&mut image, &mut zip)?;
    }
    zip.finish()?;
    Ok(())
}
