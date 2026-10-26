use crate::storage::{atomic_write, group_name, hash, no_links, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, fs, path::Path};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanvasLayout {
    schema: u32,
    positions: HashMap<String, Point>,
    group_order: Vec<String>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
struct Point { x: f64, y: f64 }
fn valid_group(path: &str) -> bool {
    group_name(path).map(|name| name == path).unwrap_or(false)
}
fn validate(layout: &CanvasLayout) -> Result<()> {
    if layout.schema != 1 || layout.positions.len() > 10000 || layout.group_order.len() > 10000 { return Err("画布布局无效，原文件已保留。".into()); }
    for (key, point) in &layout.positions {
        let valid = key.strip_prefix("note:").map(|id| uuid::Uuid::parse_str(id).map(|uuid| uuid.hyphenated().to_string().eq_ignore_ascii_case(id)).unwrap_or(false))
            .or_else(|| key.strip_prefix("group:").map(valid_group)).unwrap_or(false);
        if !valid || !point.x.is_finite() || !point.y.is_finite() || point.x.abs() > 1_000_000.0 || point.y.abs() > 1_000_000.0 { return Err("画布布局无效，原文件已保留。".into()); }
    }
    let mut seen = HashSet::new();
    if layout.group_order.iter().any(|path| !valid_group(path) || !seen.insert(path)) { return Err("画布布局无效，原文件已保留。".into()); }
    Ok(())
}
fn read(root: &Path) -> Result<(CanvasLayout, Option<String>)> {
    let path = root.join(".tistnote/canvas.json"); no_links(&path)?;
    if !path.exists() { return Ok((CanvasLayout { schema: 1, ..Default::default() }, None)); }
    let raw = fs::read(&path).map_err(|e| e.to_string())?;
    if raw.len() > 2_000_000 { return Err("画布布局无法读取，原文件已保留。".into()); }
    let layout: CanvasLayout = serde_json::from_slice(&raw).map_err(|_| "画布布局无法读取，原文件已保留。")?;
    validate(&layout).map_err(|_| "画布布局无法读取，原文件已保留。")?;
    Ok((layout, Some(hash(&raw))))
}
pub fn get(root: &Path) -> Result<Value> {
    let (layout, revision) = read(root)?; Ok(json!({"layout":layout,"revision":revision}))
}
pub fn put(root: &Path, layout: CanvasLayout, expected: Option<&str>) -> Result<Value> {
    let (_, revision) = read(root)?; validate(&layout)?;
    if revision.as_deref() != expected { return Err("画布布局已在外部更新，请刷新画布后重试。".into()); }
    let raw = serde_json::to_vec_pretty(&layout).map_err(|e| e.to_string())?;
    if raw.len() > 2_000_000 { return Err("画布布局过大，未保存。".into()); }
    atomic_write(&root.join(".tistnote/canvas.json"), &raw)?;
    Ok(json!({"layout":layout,"revision":hash(&raw)}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn layout_roundtrip_conflicts_and_corruption_preserve_files() {
        let dir = tempfile::tempdir().unwrap(); fs::create_dir(dir.path().join(".tistnote")).unwrap();
        let layout: CanvasLayout = serde_json::from_value(json!({"schema":1,"positions":{"group:生活":{"x":100.0,"y":-20.0}},"groupOrder":["生活"]})).unwrap();
        let saved = put(dir.path(), layout.clone(), None).unwrap();
        assert_eq!(get(dir.path()).unwrap(), saved);
        let path = dir.path().join(".tistnote/canvas.json"); let original = fs::read(&path).unwrap();
        assert!(put(dir.path(), layout.clone(), Some("stale")).is_err()); assert_eq!(fs::read(&path).unwrap(), original);
        fs::write(&path, b"broken").unwrap(); assert!(put(dir.path(), layout, None).is_err()); assert_eq!(fs::read(&path).unwrap(), b"broken");
    }
}
