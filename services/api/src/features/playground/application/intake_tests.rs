use super::*;

const AXIAL: ([f64; 3], [f64; 3]) = ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]);
const SAGITTAL: ([f64; 3], [f64; 3]) = ([0.0, 1.0, 0.0], [0.0, 0.0, -1.0]);

fn slice(stack: &str, orientation: ([f64; 3], [f64; 3]), position: f64) -> MprSourceSlice {
    let (row_direction, column_direction) = orientation;
    let normal = normalize3(cross3(row_direction, column_direction)).unwrap();
    MprSourceSlice {
        file_path: PathBuf::from(format!("{stack}-{position}.dcm")),
        frame_index: 0,
        series_uid: "2.25.1".into(),
        stack_key: stack.into(),
        series_label: "T1 3D".into(),
        frame_of_reference_uid: Some("2.25.2".into()),
        rows: 4,
        columns: 4,
        image_position: scale3(normal, position),
        row_direction,
        column_direction,
        row_spacing: 1.0,
        column_spacing: 1.0,
        slice_projection: 0.0,
    }
}

fn positions(stack: &[MprSourceSlice]) -> Vec<f64> {
    stack.iter().map(|slice| slice.slice_projection).collect()
}

#[test]
fn the_main_stack_wins_even_when_a_localizer_is_read_first() {
    let mut slices = vec![
        slice("localizer", SAGITTAL, 0.0),
        slice("localizer", SAGITTAL, 5.0),
    ];
    slices.extend((0..20).map(|index| slice("t1", AXIAL, index as f64)));

    let stack = select_mpr_stack(slices).unwrap();

    assert_eq!(stack.len(), 20);
    assert!(stack.iter().all(|slice| slice.stack_key == "t1"));
}

#[test]
fn echoes_at_the_same_positions_are_not_mixed() {
    let mut slices = Vec::new();
    for index in 0..12 {
        slices.push(slice("echo-1", AXIAL, index as f64 * 3.0));
        slices.push(slice("echo-2", AXIAL, index as f64 * 3.0));
    }

    let stack = select_mpr_stack(slices).unwrap();
    let echo = stack[0].stack_key.clone();

    assert_eq!(stack.len(), 12);
    assert!(stack.iter().all(|slice| slice.stack_key == echo));
}

#[test]
fn a_missing_slice_is_filled_so_the_volume_keeps_its_length() {
    let slices = (0..30)
        .filter(|index| *index != 14)
        .map(|index| slice("t1", AXIAL, index as f64 * 1.5))
        .collect::<Vec<_>>();

    let stack = select_mpr_stack(slices).unwrap();

    assert_eq!(stack.len(), 30);
    assert_eq!(positions(&stack)[14], 21.0);
    assert_eq!(stack[14].image_position[2], 21.0);
    // The filled slice reuses a real neighbour's pixels.
    assert_eq!(stack[14].file_path, stack[13].file_path);
}

#[test]
fn uneven_spacing_names_the_series_in_plain_words() {
    let slices = [0.0, 1.0, 2.0, 3.7, 4.7, 5.7]
        .into_iter()
        .map(|position| slice("t2", AXIAL, position))
        .collect::<Vec<_>>();

    let error = select_mpr_stack(slices).unwrap_err().to_string();

    assert!(error.contains("\"T1 3D\" (6 images)"), "{error}");
    assert!(error.contains("uneven slice spacing"), "{error}");
}

#[test]
fn too_many_missing_slices_are_refused() {
    // 7 single gaps in 40 slices: each is fillable, but together too many.
    let slices = (0..40)
        .filter(|index| index % 5 != 0 || *index == 0)
        .map(|index| slice("t1", AXIAL, index as f64))
        .collect::<Vec<_>>();

    let error = select_mpr_stack(slices).unwrap_err().to_string();

    assert!(error.contains("is missing"), "{error}");
}

#[test]
fn export_clutter_is_skipped_but_uid_named_slices_are_kept() {
    for kept in [
        "DICOM/IM0001",
        "1.3.12.2.1107.5.2.43.66012.2020",
        "MR.1.2.840.113619.2.55",
        "I.001",
        "study/series/IMG0001.dcm",
        "DICOMDIR",
    ] {
        assert!(!is_bundled_non_dicom_entry(kept), "{kept}");
    }
    for skipped in [
        "README.TXT",
        "autorun.inf",
        "Viewer/viewer.exe",
        "__MACOSX/DICOM/._IM0001",
        ".DS_Store",
        "Thumbs.db",
        "report.pdf",
    ] {
        assert!(is_bundled_non_dicom_entry(skipped), "{skipped}");
    }
}

#[test]
fn dicom_files_are_recognised_by_content() {
    let root = std::env::temp_dir().join(format!("anatomy-intake-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let dicom = root.join("1.3.12.2.1107");
    let mut bytes = vec![0u8; 128];
    bytes.extend_from_slice(b"DICM\x02\x00");
    std::fs::write(&dicom, &bytes).unwrap();
    let other = root.join("IM0002");
    std::fs::write(&other, b"not a dicom file").unwrap();

    assert!(has_dicom_preamble(&dicom));
    assert!(!has_dicom_preamble(&other));
    let _ = std::fs::remove_dir_all(&root);
}
