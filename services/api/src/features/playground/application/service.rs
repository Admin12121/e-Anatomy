use sqlx::PgPool;
use uuid::Uuid;

use crate::features::playground::{
    domain::models::{
        CreateZoneInput, CreateZoneModalityAssetInput, CreateZoneModalityInput, UpdateZoneInput,
        UpdateZoneModalityAssetInput, UpdateZoneModalityInput, ZoneDetail, ZoneListResponse,
        ZoneModality, ZoneModalityAsset, ZoneModalityAssetListResponse, ZoneModalityListResponse,
    },
    infrastructure::repository::PlaygroundRepository,
};
use crate::infrastructure::error::AppError;

#[derive(Clone)]
pub struct PlaygroundService {
    pool: PgPool,
    repo: PlaygroundRepository,
}

impl PlaygroundService {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            repo: PlaygroundRepository::default(),
        }
    }

    pub async fn list_zones_for_account(
        &self,
        account_id: Uuid,
    ) -> Result<ZoneListResponse, AppError> {
        let items = self
            .repo
            .list_zones_for_account(&self.pool, account_id)
            .await?;

        Ok(ZoneListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn get_zone_detail(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<ZoneDetail, AppError> {
        self.repo
            .get_zone_detail(&self.pool, account_id, zone_id)
            .await?
            .ok_or_else(|| AppError::not_found("Zone was not found"))
    }

    pub async fn create_zone(
        &self,
        account_id: Uuid,
        user_id: &str,
        input: CreateZoneInput,
    ) -> Result<ZoneDetail, AppError> {
        let name = normalize_required_name(&input.name)?;
        let description = normalize_optional_text(input.description);
        let body_view = normalize_body_view(input.body_view)?;
        let anchor = validate_anchor(input.anchor)?;
        let slug = self.allocate_slug(account_id, &name).await?;

        let zone = self
            .repo
            .create_zone(
                &self.pool,
                account_id,
                user_id,
                &slug,
                &name,
                description.as_deref(),
                &body_view,
                anchor.x,
                anchor.y,
                anchor.z,
            )
            .await?;

        Ok(zone)
    }

    pub async fn list_zone_modalities(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
    ) -> Result<ZoneModalityListResponse, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let items = self
            .repo
            .list_zone_modalities(&self.pool, account_id, zone_id)
            .await?;

        Ok(ZoneModalityListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn create_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let name = normalize_required_name(&input.name)?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .create_zone_modality(
                &self.pool,
                zone_id,
                user_id,
                &name,
                &modality_type,
                cover_image_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                &processing_status,
                notes.as_deref(),
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_zone_modality(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: UpdateZoneModalityInput,
    ) -> Result<ZoneModality, AppError> {
        self.ensure_zone_exists(account_id, zone_id).await?;

        let name = normalize_required_name(&input.name)?;
        let modality_type = normalize_modality_type(&input.modality_type)?;
        let cover_image_url = normalize_optional_text(input.cover_image_url);
        let source_kind = normalize_source_kind(input.source_kind)?;
        let source_label = normalize_optional_text(input.source_label);
        let source_file_count = normalize_source_file_count(input.source_file_count)?;
        let processing_status = normalize_processing_status(input.processing_status)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .update_zone_modality(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                user_id,
                &name,
                &modality_type,
                cover_image_url.as_deref(),
                &source_kind,
                source_label.as_deref(),
                source_file_count,
                &processing_status,
                notes.as_deref(),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Modality was not found"))
    }

    pub async fn list_zone_modality_assets(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<ZoneModalityAssetListResponse, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let items = self
            .repo
            .list_zone_modality_assets(&self.pool, account_id, zone_id, modality_id)
            .await?;

        Ok(ZoneModalityAssetListResponse {
            total: items.len(),
            items,
        })
    }

    pub async fn create_zone_modality_asset(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        user_id: &str,
        input: CreateZoneModalityAssetInput,
    ) -> Result<ZoneModalityAsset, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let label = normalize_required_label(&input.label)?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
        let image_url = normalize_required_image_url(&input.image_url)?;
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .create_zone_modality_asset(
                &self.pool,
                modality_id,
                user_id,
                &label,
                &asset_kind,
                weighting_code.as_deref(),
                &image_url,
                thumbnail_url.as_deref(),
                sort_order,
                notes.as_deref(),
            )
            .await
            .map_err(Into::into)
    }

    pub async fn update_zone_modality_asset(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
        asset_id: Uuid,
        user_id: &str,
        input: UpdateZoneModalityAssetInput,
    ) -> Result<ZoneModalityAsset, AppError> {
        self.ensure_modality_exists(account_id, zone_id, modality_id)
            .await?;

        let label = normalize_required_label(&input.label)?;
        let asset_kind = normalize_asset_kind(input.asset_kind)?;
        let weighting_code = normalize_weighting_code(input.weighting_code)?;
        let image_url = normalize_required_image_url(&input.image_url)?;
        let thumbnail_url = normalize_optional_text(input.thumbnail_url);
        let sort_order = normalize_sort_order(input.sort_order)?;
        let notes = normalize_optional_text(input.notes);

        self.repo
            .update_zone_modality_asset(
                &self.pool,
                account_id,
                zone_id,
                modality_id,
                asset_id,
                user_id,
                &label,
                &asset_kind,
                weighting_code.as_deref(),
                &image_url,
                thumbnail_url.as_deref(),
                sort_order,
                notes.as_deref(),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Modality asset was not found"))
    }

    pub async fn update_zone(
        &self,
        account_id: Uuid,
        user_id: &str,
        zone_id: Uuid,
        input: UpdateZoneInput,
    ) -> Result<ZoneDetail, AppError> {
        let name = normalize_required_name(&input.name)?;
        let description = normalize_optional_text(input.description);
        let body_view = normalize_body_view(input.body_view)?;
        let anchor = match input.anchor {
            Some(anchor) => Some(validate_anchor(anchor)?),
            None => None,
        };

        self.repo
            .update_zone(
                &self.pool,
                account_id,
                zone_id,
                user_id,
                &name,
                description.as_deref(),
                &body_view,
                anchor.as_ref().map(|value| value.x),
                anchor.as_ref().map(|value| value.y),
                anchor.as_ref().map(|value| value.z),
            )
            .await?
            .ok_or_else(|| AppError::not_found("Zone was not found"))
    }

    async fn allocate_slug(&self, account_id: Uuid, name: &str) -> Result<String, AppError> {
        let base = slugify(name);
        let mut candidate = base.clone();
        let mut suffix = 1;

        while self
            .repo
            .slug_exists(&self.pool, account_id, &candidate)
            .await?
        {
            candidate = format!("{base}-{suffix}");
            suffix += 1;
        }

        Ok(candidate)
    }

    async fn ensure_zone_exists(&self, account_id: Uuid, zone_id: Uuid) -> Result<(), AppError> {
        let exists = self
            .repo
            .zone_exists_for_account(&self.pool, account_id, zone_id)
            .await?;

        if exists {
            Ok(())
        } else {
            Err(AppError::not_found("Zone was not found"))
        }
    }

    async fn ensure_modality_exists(
        &self,
        account_id: Uuid,
        zone_id: Uuid,
        modality_id: Uuid,
    ) -> Result<(), AppError> {
        let exists = self
            .repo
            .modality_exists_for_account(&self.pool, account_id, zone_id, modality_id)
            .await?;

        if exists {
            Ok(())
        } else {
            Err(AppError::not_found("Modality was not found"))
        }
    }
}

fn normalize_required_name(value: &str) -> Result<String, AppError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(AppError::bad_request("Zone name is required"));
    }

    Ok(normalized.to_string())
}

fn normalize_required_label(value: &str) -> Result<String, AppError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(AppError::bad_request("Asset label is required"));
    }

    Ok(normalized.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|current| {
        let normalized = current.trim();

        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    })
}

fn normalize_required_image_url(value: &str) -> Result<String, AppError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(AppError::bad_request("Image URL is required"));
    }

    Ok(normalized.to_string())
}

fn normalize_body_view(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "anterior".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "anterior" | "posterior" => Ok(normalized),
        _ => Err(AppError::bad_request(
            "Body view must be anterior or posterior",
        )),
    }
}

fn validate_anchor(
    anchor: crate::features::playground::domain::models::ZoneAnchor,
) -> Result<crate::features::playground::domain::models::ZoneAnchor, AppError> {
    if !anchor.x.is_finite() || !anchor.y.is_finite() || !anchor.z.is_finite() {
        return Err(AppError::bad_request("Zone anchor is invalid"));
    }

    Ok(anchor)
}

fn normalize_modality_type(value: &str) -> Result<String, AppError> {
    let normalized = value.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "mri" | "ct" | "mra" | "mrv" | "angiography" | "cbct" | "illustration" | "photography"
        | "endoscopy" | "other" => Ok(normalized),
        _ => Err(AppError::bad_request("Modality type is invalid")),
    }
}

fn normalize_source_kind(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "manual".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "manual" | "zip" | "dicom_files" => Ok(normalized),
        _ => Err(AppError::bad_request("Source kind is invalid")),
    }
}

fn normalize_processing_status(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "draft".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "draft" | "uploaded" | "processing" | "ready" | "failed" => Ok(normalized),
        _ => Err(AppError::bad_request("Processing status is invalid")),
    }
}

fn normalize_source_file_count(value: Option<i32>) -> Result<i32, AppError> {
    let normalized = value.unwrap_or(0);

    if normalized < 0 {
        return Err(AppError::bad_request("Source file count is invalid"));
    }

    Ok(normalized)
}

fn normalize_asset_kind(value: Option<String>) -> Result<String, AppError> {
    let normalized = value
        .unwrap_or_else(|| "slice".to_string())
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "slice" | "cover" | "overview" | "reference" => Ok(normalized),
        _ => Err(AppError::bad_request("Asset kind is invalid")),
    }
}

fn normalize_weighting_code(value: Option<String>) -> Result<Option<String>, AppError> {
    let normalized = normalize_optional_text(value).map(|current| current.to_ascii_lowercase());

    match normalized.as_deref() {
        None => Ok(None),
        Some("t1" | "t1_gado" | "t2" | "t2_star" | "flair" | "adc" | "dwi" | "other") => {
            Ok(normalized)
        }
        Some(_) => Err(AppError::bad_request("Weighting code is invalid")),
    }
}

fn normalize_sort_order(value: Option<i32>) -> Result<i32, AppError> {
    let normalized = value.unwrap_or(0);

    if normalized < 0 {
        return Err(AppError::bad_request("Sort order is invalid"));
    }

    Ok(normalized)
}

fn slugify(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut previous_dash = false;

    for character in value.chars() {
        let current = character.to_ascii_lowercase();

        if current.is_ascii_alphanumeric() {
            slug.push(current);
            previous_dash = false;
            continue;
        }

        if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-');

    if trimmed.is_empty() {
        "zone".to_string()
    } else {
        trimmed.to_string()
    }
}
