use super::*;
use std::cell::RefCell;

struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("anatomy-media-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

// A deterministic grey scan-like image: smooth anatomy plus fine texture.
fn grey_slice(width: u32, height: u32, seed: u32) -> RgbaImage {
    RgbaImage::from_fn(width, height, |x, y| {
        let texture = (x.wrapping_mul(7919) ^ y.wrapping_mul(104_729) ^ seed) % 23;
        let value = ((x + y + seed) % 200 + texture) as u8;
        Rgba([value, value, value, 255])
    })
}

// What releases before this change wrote for every MPR slice.
fn legacy_png(image: &RgbaImage) -> Vec<u8> {
    let mut cursor = Cursor::new(Vec::new());
    PngEncoder::new_with_quality(&mut cursor, CompressionType::Fast, FilterType::NoFilter)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            ExtendedColorType::Rgba8,
        )
        .unwrap();
    cursor.into_inner()
}

#[test]
fn legacy_slice_shrinks_without_changing_a_pixel() {
    let scratch = Scratch::new();
    let image = grey_slice(260, 311, 3);
    let path = scratch.0.join("axial-0001.png");
    let legacy = legacy_png(&image);
    std::fs::write(&path, &legacy).unwrap();

    let (checksum, size) = upgrade_slice_file(&path, legacy.len() as i64)
        .unwrap()
        .unwrap();
    let stored = std::fs::read(&path).unwrap();

    assert!(size * 2 < legacy.len() as i64, "{size} vs {}", legacy.len());
    assert_eq!(size, stored.len() as i64);
    assert_eq!(checksum, sha256_hex(&stored));
    assert_eq!(image::load_from_memory(&stored).unwrap().to_rgba8(), image);
    // Already upgraded: a second pass leaves the file and the row alone.
    assert_eq!(upgrade_slice_file(&path, size).unwrap(), None);
    assert!(!path.with_extension("png.upgrade").exists());
}

#[test]
fn mostly_black_ct_slice_is_still_found_and_upgraded() {
    let scratch = Scratch::new();
    // Air around a small body: the old RGBA file is already small per pixel.
    let image = RgbaImage::from_fn(512, 512, |x, y| {
        let inside = (x as i32 - 256).pow(2) + (y as i32 - 256).pow(2) < 90 * 90;
        let value = if inside {
            ((x * 3 + y) % 180) as u8 + 40
        } else {
            0
        };
        Rgba([value, value, value, 255])
    });
    let path = scratch.0.join("axial-0002.png");
    let legacy = legacy_png(&image);
    std::fs::write(&path, &legacy).unwrap();

    let (_, size) = upgrade_slice_file(&path, legacy.len() as i64)
        .unwrap()
        .unwrap();

    assert!(size < legacy.len() as i64);
    assert_eq!(image::open(&path).unwrap().to_rgba8(), image);
}

#[test]
fn a_stale_row_is_corrected_after_an_interrupted_upgrade() {
    let scratch = Scratch::new();
    let path = scratch.0.join("axial-0003.png");
    let current = encode_png(&grey_slice(64, 64, 9)).unwrap();
    std::fs::write(&path, &current).unwrap();

    let corrected = upgrade_slice_file(&path, current.len() as i64 * 4).unwrap();

    assert_eq!(
        corrected,
        Some((sha256_hex(&current), current.len() as i64))
    );
}

#[test]
fn colour_and_transparent_pixels_survive_png_encoding() {
    let image = RgbaImage::from_fn(31, 17, |x, y| Rgba([x as u8 * 8, y as u8 * 15, 90, 200]));
    let decoded = image::load_from_memory(&encode_png(&image).unwrap())
        .unwrap()
        .to_rgba8();

    assert_eq!(decoded, image);
}

#[test]
fn atlas_pages_are_avif_and_load_one_page_at_a_time() {
    let scratch = Scratch::new();
    let atlas_root = scratch.0.join("atlases-test");
    std::fs::create_dir_all(&atlas_root).unwrap();
    let slices = (0..45)
        .map(|index| AtlasSlice {
            asset_id: format!("slice-{index}"),
            width: 120,
            height: 90,
        })
        .collect::<Vec<_>>();
    let loaded = RefCell::new(Vec::new());

    let pages = write_atlas_pages(&scratch.0, &atlas_root, &slices, |index| {
        loaded.borrow_mut().push(index);
        Ok(grey_slice(120, 90, index as u32))
    })
    .unwrap();

    assert_eq!(*loaded.borrow(), (0..45).collect::<Vec<_>>());
    assert_eq!(pages.len(), 2);
    assert_eq!(pages[0].frames.len(), MAX_ATLAS_SLICES_PER_PAGE);
    let frames = pages
        .iter()
        .flat_map(|page| &page.frames)
        .collect::<Vec<_>>();
    assert_eq!(frames.len(), 45);
    for (index, frame) in frames.iter().enumerate() {
        assert_eq!(frame.asset_id, format!("slice-{index}"));
        assert_eq!((frame.width, frame.height), (120, 90));
    }
    for page in &pages {
        assert!(page.storage_key.ends_with(".avif"));
        let bytes = std::fs::read(scratch.0.join(&page.storage_key)).unwrap();
        assert_eq!(&bytes[4..8], b"ftyp");
        assert_eq!(page.checksum, sha256_hex(&bytes));
        for frame in &page.frames {
            assert!(frame.x + frame.width <= page.width);
            assert!(frame.y + frame.height <= page.height);
        }
        let metadata = scratch.0.join(&page.storage_key).with_extension("json");
        let metadata: AtlasPageMetadata =
            serde_json::from_slice(&std::fs::read(metadata).unwrap()).unwrap();
        assert_eq!(metadata.frames.len(), page.frames.len());
    }
}

#[tokio::test]
async fn retiring_atlas_pages_keeps_slices_and_other_builds() {
    let scratch = Scratch::new();
    let job = scratch.0.join("derived").join("job");
    let old_root = job.join("atlases");
    let new_root = job.join("atlases-new");
    for directory in [&old_root, &new_root] {
        std::fs::create_dir_all(directory).unwrap();
        std::fs::write(directory.join("atlas-001.png"), b"page").unwrap();
        std::fs::write(directory.join("atlas-001.json"), b"{}").unwrap();
    }
    std::fs::write(job.join("axial-0001.png"), b"slice").unwrap();

    remove_atlas_files(
        &scratch.0,
        &["derived/job/atlases/atlas-001.png".to_string()],
    )
    .await;

    assert!(!old_root.exists());
    assert!(new_root.join("atlas-001.png").exists());
    assert!(new_root.join("atlas-001.json").exists());
    assert!(job.join("axial-0001.png").exists());
}
