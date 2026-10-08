use super::*;
use dicom::{
    core::{DataElement, Length, PrimitiveValue, VR, value::Value},
    dictionary_std::tags,
    object::{FileMetaTableBuilder, InMemDicomObject},
};

struct FixtureDirectory(PathBuf);
impl FixtureDirectory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("anatomy-library-test-{}", Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn output(&self, name: &str) -> PathBuf {
        let path = self.0.join(name);
        std::fs::create_dir_all(&path).unwrap();
        path
    }
}
impl Drop for FixtureDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

// Ordinary synthetic images only: no patient information or external files.
fn dicom_fixture(root: &Path, index: usize, frames: usize, enhanced: bool) -> PreparedStudyFile {
    let mut object = InMemDicomObject::from_element_iter([
        DataElement::new(tags::SOP_CLASS_UID, VR::UI, "1.2.840.10008.5.1.4.1.1.2.1"),
        DataElement::new(
            tags::SOP_INSTANCE_UID,
            VR::UI,
            format!("2.25.{}", index + 101),
        ),
        DataElement::new(tags::SERIES_INSTANCE_UID, VR::UI, "2.25.42"),
        DataElement::new(tags::FRAME_OF_REFERENCE_UID, VR::UI, "2.25.43"),
        DataElement::new(tags::SERIES_DESCRIPTION, VR::LO, "Synthetic axial study"),
        DataElement::new(tags::INSTANCE_NUMBER, VR::IS, (100 - index).to_string()),
        DataElement::new(tags::ROWS, VR::US, PrimitiveValue::from(4u16)),
        DataElement::new(tags::COLUMNS, VR::US, PrimitiveValue::from(4u16)),
        DataElement::new(tags::SAMPLES_PER_PIXEL, VR::US, PrimitiveValue::from(1u16)),
        DataElement::new(tags::BITS_ALLOCATED, VR::US, PrimitiveValue::from(8u16)),
        DataElement::new(tags::BITS_STORED, VR::US, PrimitiveValue::from(8u16)),
        DataElement::new(tags::HIGH_BIT, VR::US, PrimitiveValue::from(7u16)),
        DataElement::new(
            tags::PIXEL_REPRESENTATION,
            VR::US,
            PrimitiveValue::from(0u16),
        ),
        DataElement::new(tags::PHOTOMETRIC_INTERPRETATION, VR::CS, "MONOCHROME2"),
        DataElement::new(tags::WINDOW_CENTER, VR::DS, "128"),
        DataElement::new(tags::WINDOW_WIDTH, VR::DS, "256"),
        DataElement::new(tags::NUMBER_OF_FRAMES, VR::IS, frames.to_string()),
        DataElement::new(
            tags::PIXEL_DATA,
            VR::OB,
            PrimitiveValue::from(
                (0..frames * 16)
                    .map(|value| (value * 7) as u8)
                    .collect::<Vec<_>>(),
            ),
        ),
    ]);
    if enhanced {
        let orientation = InMemDicomObject::from_element_iter([DataElement::new(
            tags::IMAGE_ORIENTATION_PATIENT,
            VR::DS,
            "1\\0\\0\\0\\1\\0",
        )]);
        let spacing = InMemDicomObject::from_element_iter([DataElement::new(
            tags::PIXEL_SPACING,
            VR::DS,
            "1\\1",
        )]);
        let shared = InMemDicomObject::from_element_iter([
            DataElement::new(
                tags::PLANE_ORIENTATION_SEQUENCE,
                VR::SQ,
                Value::new_sequence(vec![orientation], Length::UNDEFINED),
            ),
            DataElement::new(
                tags::PIXEL_MEASURES_SEQUENCE,
                VR::SQ,
                Value::new_sequence(vec![spacing], Length::UNDEFINED),
            ),
        ]);
        object.put(DataElement::new(
            tags::SHARED_FUNCTIONAL_GROUPS_SEQUENCE,
            VR::SQ,
            Value::new_sequence(vec![shared], Length::UNDEFINED),
        ));
        let groups = (0..frames)
            .map(|frame| {
                let position = InMemDicomObject::from_element_iter([DataElement::new(
                    tags::IMAGE_POSITION_PATIENT,
                    VR::DS,
                    format!("0\\0\\{frame}"),
                )]);
                InMemDicomObject::from_element_iter([DataElement::new(
                    tags::PLANE_POSITION_SEQUENCE,
                    VR::SQ,
                    Value::new_sequence(vec![position], Length::UNDEFINED),
                )])
            })
            .collect::<Vec<_>>();
        object.put(DataElement::new(
            tags::PER_FRAME_FUNCTIONAL_GROUPS_SEQUENCE,
            VR::SQ,
            Value::new_sequence(groups, Length::UNDEFINED),
        ));
    } else {
        object.put(DataElement::new(
            tags::IMAGE_POSITION_PATIENT,
            VR::DS,
            format!("0\\0\\{index}"),
        ));
        object.put(DataElement::new(
            tags::IMAGE_ORIENTATION_PATIENT,
            VR::DS,
            "1\\0\\0\\0\\1\\0",
        ));
        object.put(DataElement::new(tags::PIXEL_SPACING, VR::DS, "1\\1"));
    }
    let path = root.join(format!("{index}.dcm"));
    object
        .with_meta(FileMetaTableBuilder::new().transfer_syntax("1.2.840.10008.1.2.1"))
        .unwrap()
        .write_to_file(&path)
        .unwrap();
    PreparedStudyFile {
        source_relative_path: Some(format!("{index}.dcm")),
        original_file_name: format!("{index}.dcm"),
        file_path: path,
    }
}

fn package(root: &Path, images: &Path, manifest: &LibraryManifest, omit_last: bool) -> PathBuf {
    let path = root.join(format!("package-{}.zip", Uuid::new_v4()));
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("manifest.json", options).unwrap();
    zip.write_all(&serde_json::to_vec(manifest).unwrap())
        .unwrap();
    let count = manifest.slices.len() - usize::from(omit_last);
    for slice in manifest.slices.iter().take(count) {
        zip.start_file(&slice.filename, options).unwrap();
        zip.write_all(&std::fs::read(images.join(&slice.filename)).unwrap())
            .unwrap();
    }
    zip.finish().unwrap();
    path
}

#[test]
fn normal_series_uses_patient_position_not_zip_or_instance_order() {
    let temp = FixtureDirectory::new();
    let files = [2, 0, 1]
        .map(|index| dicom_fixture(&temp.0, index, 1, false))
        .to_vec();
    let manifest = convert_package(Uuid::new_v4(), "ct".into(), files, temp.output("png")).unwrap();
    assert_eq!(manifest.slices.len(), 3);
    for (index, slice) in manifest.slices.iter().enumerate() {
        assert_eq!(slice.slice_index, index as i32);
        assert_eq!(slice.image_position, Some([0., 0., index as f64]));
        assert_eq!(
            slice.filename,
            format!("axial_{:04}_{}.png", index + 1, slice.id)
        );
        assert!(temp.output("png").join(&slice.filename).is_file());
    }
}

#[test]
fn enhanced_multiframe_normal_stack_preserves_every_frame_and_geometry() {
    let temp = FixtureDirectory::new();
    let manifest = convert_package(
        Uuid::new_v4(),
        "mri".into(),
        vec![dicom_fixture(&temp.0, 0, 4, true)],
        temp.output("png"),
    )
    .unwrap();
    assert_eq!(manifest.slices.len(), 4);
    for (frame, slice) in manifest.slices.iter().enumerate() {
        assert_eq!(slice.frame_index, frame as u32);
        assert_eq!(slice.image_position, Some([0., 0., frame as f64]));
        assert_eq!(slice.pixel_spacing, Some([1., 1.]));
        assert_eq!(slice.orientation_code.as_deref(), Some("axial"));
        assert_eq!((slice.width, slice.height), (4, 4));
    }
    assert_eq!(
        manifest
            .slices
            .iter()
            .map(|s| s.id)
            .collect::<BTreeSet<_>>()
            .len(),
        4
    );
}

#[test]
fn edited_png_roundtrip_generates_avif_and_complete_atlas_mapping() {
    let temp = FixtureDirectory::new();
    let images = temp.output("png");
    let manifest = convert_package(
        Uuid::new_v4(),
        "mri".into(),
        vec![dicom_fixture(&temp.0, 0, 2, true)],
        images.clone(),
    )
    .unwrap();
    let edited = RgbaImage::from_pixel(4, 4, Rgba([20, 40, 60, 255]));
    std::fs::write(
        images.join(&manifest.slices[0].filename),
        encode_png(&edited).unwrap(),
    )
    .unwrap();
    let output = temp.output("encoded");
    validate_and_encode(
        &package(&temp.0, &images, &manifest, false),
        &output,
        &manifest,
    )
    .unwrap();
    for slice in &manifest.slices {
        assert!(
            std::fs::metadata(output.join("avif").join(format!("{}.avif", slice.id)))
                .unwrap()
                .len()
                > 0
        );
        assert_eq!(
            std::fs::read(output.join("png").join(&slice.filename)).unwrap(),
            std::fs::read(images.join(&slice.filename)).unwrap()
        );
    }
    let pages: Vec<BuiltAtlasPage> =
        serde_json::from_slice(&std::fs::read(output.join("library-atlases.json")).unwrap())
            .unwrap();
    let mapped = pages
        .iter()
        .flat_map(|page| page.frames.iter().map(|frame| frame.asset_id.clone()))
        .collect::<BTreeSet<_>>();
    assert_eq!(
        mapped,
        manifest.slices.iter().map(|s| s.id.to_string()).collect()
    );
}

#[test]
fn missing_slice_resized_image_and_old_revision_are_rejected() {
    let temp = FixtureDirectory::new();
    let images = temp.output("png");
    let manifest = convert_package(
        Uuid::new_v4(),
        "ct".into(),
        vec![dicom_fixture(&temp.0, 0, 2, true)],
        images.clone(),
    )
    .unwrap();
    assert!(
        validate_and_encode(
            &package(&temp.0, &images, &manifest, true),
            &temp.output("missing"),
            &manifest
        )
        .is_err()
    );
    let valid = package(&temp.0, &images, &manifest, false);
    let mut newer = manifest.clone();
    newer.revision += 1;
    assert!(matches!(
        validate_and_encode(&valid, &temp.output("stale"), &newer),
        Err(AppError::Conflict(_))
    ));
    let resized = RgbaImage::from_pixel(3, 4, Rgba([0, 0, 0, 255]));
    std::fs::write(
        images.join(&manifest.slices[0].filename),
        encode_png(&resized).unwrap(),
    )
    .unwrap();
    assert!(
        validate_and_encode(
            &package(&temp.0, &images, &manifest, false),
            &temp.output("resized"),
            &manifest
        )
        .is_err()
    );
}

#[test]
fn single_and_enhanced_multiframe_mpr_export_all_planes() {
    for enhanced in [false, true] {
        let temp = FixtureDirectory::new();
        let files = if enhanced {
            vec![dicom_fixture(&temp.0, 0, 4, true)]
        } else {
            (0..4)
                .map(|index| dicom_fixture(&temp.0, index, 1, false))
                .collect()
        };
        let images = temp.output("png");
        let manifest =
            convert_package(Uuid::new_v4(), "mpr".into(), files, images.clone()).unwrap();
        let volume = manifest.volume.as_ref().unwrap();
        assert_eq!(volume.dimensions, [4, 4, 4]);
        assert_eq!(volume.source_slice_count, 4);
        assert_eq!(manifest.slices.len(), 12);
        for plane in ["axial", "coronal", "sagittal"] {
            let indices = manifest
                .slices
                .iter()
                .filter(|s| s.orientation_code.as_deref() == Some(plane))
                .map(|s| s.slice_index)
                .collect::<BTreeSet<_>>();
            assert_eq!(indices, BTreeSet::from([0, 1, 2, 3]));
        }
        for slice in &manifest.slices {
            let plane = slice.orientation_code.as_deref().unwrap();
            let expected = format!("{plane}_{:04}_{}.png", slice.slice_index + 1, slice.id);
            assert_eq!(slice.filename, expected);
        }
        validate_and_encode(
            &package(&temp.0, &images, &manifest, false),
            &temp.output("avif"),
            &manifest,
        )
        .unwrap();
    }
}

#[test]
fn mpr_exclusions_keep_edited_pixels_and_correct_physical_axes() {
    let mut excluded = MprExcludedSlices::default();
    excluded.axial.insert(0);
    excluded.sagittal.insert(1);
    let edited = Rgba([50, 100, 150, 255]);
    let mut coronal = RgbaImage::from_pixel(4, 4, edited);
    mask_library_plane(&mut coronal, "coronal", 2, [4, 4, 4], &excluded);
    assert_eq!(*coronal.get_pixel(2, 0), edited);
    assert_eq!(*coronal.get_pixel(2, 3), Rgba([0, 0, 0, 255])); // z=0 is bottom
    assert_eq!(*coronal.get_pixel(1, 0), Rgba([0, 0, 0, 255])); // x=1 is column 1
    let mut axial = RgbaImage::from_pixel(4, 4, edited);
    mask_library_plane(&mut axial, "axial", 2, [4, 4, 4], &excluded);
    assert_eq!(*axial.get_pixel(2, 1), edited);
    assert_eq!(*axial.get_pixel(1, 1), Rgba([0, 0, 0, 255]));
}

async fn wait_for_library(
    service: &PlaygroundService,
    account: Uuid,
    id: Uuid,
    status: &str,
) -> anyhow::Result<LibraryStudy> {
    for _ in 0..200 {
        let study = service.get_library(account, id).await?;
        if study.status == status {
            return Ok(study);
        }
        anyhow::ensure!(
            study.status != "failed" && study.error_message.is_none(),
            "Conversion failed: {:?}",
            study.error_message
        );
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    anyhow::bail!("Library conversion did not finish")
}

// Explicit opt-in: creates only a temporary synthetic tenant, then removes it.
// Uses an isolated temporary storage root, never the application's image files.
#[tokio::test]
#[ignore = "requires the local migrated PostgreSQL database"]
async fn library_database_roundtrip_preserves_viewer_mapping_and_snapshots() -> anyhow::Result<()> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(4)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    let temp = FixtureDirectory::new();
    let account = Uuid::new_v4();
    let user = format!("library-test-{}", Uuid::new_v4());
    let zone = Uuid::new_v4();
    let service = PlaygroundService::new(pool.clone(), temp.0.to_string_lossy().into_owned());
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO \"user\"(id,name,email) VALUES($1,'Synthetic library test',$2)")
        .bind(&user)
        .bind(format!("{user}@example.invalid"))
        .execute(tx.as_mut())
        .await?;
    sqlx::query("INSERT INTO accounts(id,account_type,slug,name) VALUES($1,'personal',$2,'Synthetic library test')")
        .bind(account).bind(format!("library-test-{account}")).execute(tx.as_mut()).await?;
    sqlx::query("INSERT INTO anatomy_zones(id,account_id,slug,canonical_slug,name,anchor_x,anchor_y,anchor_z,created_by_user_id,updated_by_user_id) VALUES($1,$2,'head','head','Head',0,0,0,$3,$3)")
        .bind(zone).bind(account).bind(&user).execute(tx.as_mut()).await?;
    tx.commit().await?;
    let result: anyhow::Result<()> = async {
        for kind in ["mri", "mpr"] {
            let source = dicom_fixture(&temp.0, 0, 4, true);
            let input = temp.0.join(format!("{kind}.zip"));
            let mut zip = zip::ZipWriter::new(std::fs::File::create(&input)?);
            zip.start_file("study.dcm", zip::write::SimpleFileOptions::default())?;
            zip.write_all(&std::fs::read(source.file_path)?)?;
            zip.finish()?;
            // Optional export for a browser smoke test; generated pixels only.
            if let Ok(directory) = std::env::var("ANATOMY_LIBRARY_FIXTURE_DIR") {
                std::fs::create_dir_all(&directory)?;
                std::fs::copy(&input, Path::new(&directory).join(format!("{kind}.zip")))?;
            }
            let study = service
                .import_library(account, &user, kind, kind, input)
                .await?;
            wait_for_library(&service, account, study.id, "editable").await?;
            let exported = service.export_library(account, study.id).await?;
            service
                .reupload_library(account, study.id, exported)
                .await?;
            let ready = wait_for_library(&service, account, study.id, "ready").await?;
            anyhow::ensure!(
                ready.revision == 2 && ready.slice_count == if kind == "mpr" { 12 } else { 4 }
            );
            let attach = |revision| AttachLibraryInput {
                zone_id: zone,
                family_id: None,
                name: format!("Synthetic {kind} revision {revision}"),
                modality_type: kind.into(),
                weighting_code: None,
                thumbnail_url: None,
                revision,
            };
            let modality = service
                .attach_library(account, &user, study.id, attach(2))
                .await?;
            let modality_id = Uuid::parse_str(&modality.id)?;
            let viewer = service
                .get_zone_modality_viewer_manifest(account, zone, modality_id)
                .await?;
            anyhow::ensure!(viewer.assets.len() == ready.slice_count as usize);
            anyhow::ensure!(viewer.atlas_frames.len() == viewer.assets.len());
            let mapped = viewer
                .atlas_frames
                .iter()
                .map(|frame| frame.asset_id.clone())
                .collect::<BTreeSet<_>>();
            anyhow::ensure!(mapped == viewer.assets.iter().map(|asset| asset.id.clone()).collect());
            anyhow::ensure!(
                viewer.viewer_schema_version.as_deref()
                    == Some(if kind == "mpr" { "mpr-1" } else { "draft-1" })
            );
            let snapshot = temp
                .0
                .join(viewer.assets[0].storage_key.as_ref().unwrap())
                .with_extension("png");
            let before = std::fs::read(&snapshot)?;
            let manifest = service.library_manifest(account, study.id).await?;
            let editing = temp.output(&format!("editing-{kind}"));
            for slice in &manifest.slices {
                std::fs::copy(
                    service
                        .library_root(account, study.id)
                        .join("2/png")
                        .join(&slice.filename),
                    editing.join(&slice.filename),
                )?;
            }
            let slice = &manifest.slices[0];
            let changed = RgbaImage::from_pixel(slice.width, slice.height, Rgba([20, 40, 60, 255]));
            std::fs::write(editing.join(&slice.filename), encode_png(&changed)?)?;
            service
                .reupload_library(
                    account,
                    study.id,
                    package(&temp.0, &editing, &manifest, false),
                )
                .await?;
            let revised = wait_for_library(&service, account, study.id, "ready").await?;
            anyhow::ensure!(revised.revision == 3);
            anyhow::ensure!(
                std::fs::read(&snapshot)? == before,
                "Existing modality snapshot changed"
            );
            let reused = service
                .attach_library(account, &user, study.id, attach(3))
                .await?;
            let new_viewer = service
                .get_zone_modality_viewer_manifest(account, zone, Uuid::parse_str(&reused.id)?)
                .await?;
            let new_png = temp
                .0
                .join(new_viewer.assets[0].storage_key.as_ref().unwrap())
                .with_extension("png");
            anyhow::ensure!(
                std::fs::read(&new_png)? != before,
                "New snapshot did not use edited pixels"
            );
            sqlx::query("UPDATE anatomy_image_library SET status='encoding' WHERE id=$1")
                .bind(study.id)
                .execute(&pool)
                .await?;
            anyhow::ensure!(matches!(
                service.delete_library(account, study.id).await,
                Err(AppError::Conflict(_))
            ));
            sqlx::query("UPDATE anatomy_image_library SET status='ready' WHERE id=$1")
                .bind(study.id)
                .execute(&pool)
                .await?;
            service.delete_library(account, study.id).await?;
            anyhow::ensure!(matches!(
                service.get_library(account, study.id).await,
                Err(AppError::NotFound(_))
            ));
            anyhow::ensure!(!service.library_root(account, study.id).exists());
            anyhow::ensure!(
                snapshot.exists() && new_png.exists(),
                "Deleting the library removed modality snapshots"
            );
            let retained = service
                .get_zone_modality_viewer_manifest(account, zone, modality_id)
                .await?;
            anyhow::ensure!(retained.assets.len() == viewer.assets.len());
        }
        Ok(())
    }
    .await;
    let cleanup = sqlx::query("DELETE FROM accounts WHERE id=$1")
        .bind(account)
        .execute(&pool)
        .await;
    let cleanup_user = sqlx::query("DELETE FROM \"user\" WHERE id=$1")
        .bind(&user)
        .execute(&pool)
        .await;
    cleanup?;
    cleanup_user?;
    result
}

#[test]
fn slice_files_are_named_in_plane_order_with_series_prefix_only_when_shared() {
    let temp = FixtureDirectory::new();
    let images = temp.output("png");
    let mut slices: Vec<LibrarySlice> = [
        ("a", "axial", 0),
        ("a", "axial", 1),
        ("b", "axial", 0),
        ("c", "coronal", 0),
    ]
    .into_iter()
    .map(|(series, plane, index)| {
        let id = Uuid::new_v4();
        std::fs::write(images.join(format!("{id}.png")), b"png").unwrap();
        LibrarySlice {
            id,
            filename: format!("{id}.png"),
            width: 1,
            height: 1,
            series_uid: series.into(),
            series_label: series.into(),
            instance_uid: None,
            instance_number: None,
            frame_index: 0,
            slice_index: index,
            orientation_code: Some(plane.into()),
            image_position: None,
            image_orientation: None,
            pixel_spacing: None,
        }
    })
    .collect();
    name_slice_files(&images, &mut slices).unwrap();
    let names: Vec<_> = slices
        .iter()
        .map(|s| {
            s.filename
                .trim_end_matches(&format!("_{}.png", s.id))
                .to_string()
        })
        .collect();
    assert_eq!(
        names,
        [
            "s1_axial_0001",
            "s1_axial_0002",
            "s2_axial_0001",
            "coronal_0001"
        ]
    );
    assert!(slices.iter().all(|s| images.join(&s.filename).is_file()));
}
