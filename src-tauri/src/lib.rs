mod storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{borrow::Cow, fs, path::PathBuf, sync::Mutex};
use storage::{Note, Result, Store, Template};
use tauri::{Manager, State};

#[derive(Default)]
struct AppState(Mutex<Option<Store>>);
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Request {
    Activity,
    List {
        #[serde(default)]
        recover: bool,
    },
    Save {
        note: Note,
        expected: Option<String>,
        #[serde(default)]
        group: Option<String>,
    },
    Versions {
        id: String,
    },
    CommitEdit {
        id: String,
        expected: String,
        label: String,
    },
    ReviewNote {
        id: String,
        expected: String,
    },
    CancelEdit {
        note: Note,
        expected: String,
        group: String,
    },
    Snapshot {
        id: String,
        kind: String,
        #[serde(default)]
        label: String,
    },
    Restore {
        id: String,
        version: String,
        expected: String,
    },
    Trash {
        id: String,
        restore: bool,
        expected: String,
    },
    Purge {
        id: String,
    },
    TemplatePut {
        template: Template,
    },
    TemplateDelete {
        id: String,
    },
    Reveal,
    GroupCreate {
        name: String,
    },
    GroupRename {
        name: String,
        new_name: String,
    },
    GroupDelete {
        name: String,
    },
    MoveNote {
        id: String,
        group: String,
        expected: String,
    },
}
#[tauri::command]
fn vault_command(request: Request, state: State<AppState>) -> Result<Value> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let s = guard.as_ref().ok_or("请先打开本地资料库")?;
    let value = match request {
        Request::Activity => json!(s.activity()?),
        Request::List { recover } => json!(s.list(recover)?),
        Request::Save {
            note,
            expected,
            group,
        } => json!(s.save_in(note, expected.as_deref(), group.as_deref())?),
        Request::GroupCreate { name } => {
            s.create_group(&name)?;
            json!(null)
        }
        Request::GroupRename { name, new_name } => {
            s.rename_group(&name, &new_name)?;
            json!(null)
        }
        Request::GroupDelete { name } => {
            s.delete_group(&name)?;
            json!(null)
        }
        Request::MoveNote {
            id,
            group,
            expected,
        } => json!(s.move_note(&id, &group, &expected)?),
        Request::Versions { id } => json!(s.versions(&id)?),
        Request::ReviewNote { id, expected } => json!(s.review_note(&id, &expected)?),
        Request::CancelEdit {
            note,
            expected,
            group,
        } => json!(s.cancel_edit(note, &expected, &group)?),
        Request::CommitEdit {
            id,
            expected,
            label,
        } => {
            s.commit_edit(&id, &expected, &label)?;
            json!(null)
        }
        Request::Snapshot { id, kind, label } => {
            if !["auto", "milestone", "external", "recovery"].contains(&kind.as_str()) {
                return Err("未知的版本类型".into());
            }
            s.snapshot(&id, &kind, &label, kind == "milestone")?;
            json!(null)
        }
        Request::Restore {
            id,
            version,
            expected,
        } => json!(s.restore_version(&id, &version, &expected)?),
        Request::Trash {
            id,
            restore,
            expected,
        } => {
            s.move_trash(&id, restore, &expected)?;
            json!(null)
        }
        Request::Purge { id } => {
            s.purge(&id)?;
            json!(null)
        }
        Request::TemplatePut { template } => {
            s.put_template(template)?;
            json!(null)
        }
        Request::TemplateDelete { id } => {
            s.delete_template(&id)?;
            json!(null)
        }
        Request::Reveal => {
            std::process::Command::new("explorer.exe")
                .arg(&s.root)
                .spawn()
                .map_err(|e| e.to_string())?;
            json!(null)
        }
    };
    Ok(value)
}
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    let p = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p.join("preferences.json"))
}
fn select_store(app: &tauri::AppHandle, path: PathBuf) -> Result<Value> {
    let state = app.state::<AppState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(current) = guard.as_ref() {
        if fs::canonicalize(&path).ok().as_ref() == Some(&current.root) {
            return Ok(json!(current.list(true)?));
        }
    }
    let s = Store::open(&path)?;
    let result = s.list(true)?;
    storage::atomic_write(
        &config_path(app)?,
        &serde_json::to_vec(&json!({"path":s.root})).map_err(|e| e.to_string())?,
    )?;
    *guard = Some(s);
    Ok(json!(result))
}
#[tauri::command]
fn startup(app: tauri::AppHandle) -> Result<Value> {
    let p = config_path(&app)?;
    if !p.exists() {
        return Ok(json!(null));
    }
    let v: Value = serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let path = v["path"].as_str().ok_or("资料库设置无法读取")?;
    if !std::path::Path::new(path).exists() {
        return Err("上次的资料库不存在，请重新选择。原始文件未被修改。".into());
    }
    select_store(&app, PathBuf::from(path))
}
#[tauri::command]
async fn pick_vault(app: tauri::AppHandle, restore: bool, language: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let english = language.as_deref() == Some("en");
        let Some(path) = rfd::FileDialog::new()
            .set_title(if restore {
                if english { "Select a complete Tistnote backup folder" } else { "选择完整的品记备份文件夹" }
            } else {
                if english { "Create or select a local library folder" } else { "创建或选择本地资料库文件夹" }
            })
            .pick_folder()
        else {
            return Ok(json!(null));
        };
        if restore {
            if !path.join(".tistnote/manifest.json").is_file() {
                return Err("此文件夹不是完整的品记资料库备份".into());
            }
            let Some(parent) = rfd::FileDialog::new()
                .set_title(if english { "Select a restore location (creates a new folder)" } else { "选择恢复位置（会创建新的文件夹）" })
                .pick_folder()
            else {
                return Ok(json!(null));
            };
            let source = Store::open(&path)?;
            let check = source.list(false)?;
            if !check.warnings.is_empty() {
                return Err(format!(
                    "备份存在无法读取的内容：{}",
                    check.warnings.join("；")
                ));
            }
            let copied = storage::copy_vault(&source.root, &parent, "品记恢复")?;
            select_store(&app, copied)
        } else {
            select_store(&app, path)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn backup_vault(app: tauri::AppHandle, language: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(parent) = rfd::FileDialog::new()
            .set_title(if language.as_deref() == Some("en") { "Save the backup outside your library" } else { "将备份保存到资料库以外的位置" })
            .pick_folder()
        else {
            return Ok(json!(null));
        };
        let state = app.state::<AppState>();
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let s = guard.as_ref().ok_or("请先打开资料库")?;
        Ok(json!(s.backup(&parent)?.to_string_lossy()))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn import_note(app: tauri::AppHandle, language: Option<String>) -> Result<Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .set_title(if language.as_deref() == Some("en") { "Import Tistnote Markdown" } else { "导入品记 Markdown" })
            .add_filter(if language.as_deref() == Some("en") { "Tistnote notes" } else { "品记笔记" }, &["md"])
            .pick_file()
        else {
            return Ok(json!(null));
        };
        let state = app.state::<AppState>();
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        Ok(json!(guard
            .as_ref()
            .ok_or("请先打开资料库")?
            .import(&path)?))
    })
    .await
    .map_err(|e| e.to_string())?
}
fn png_bytes(data: &str) -> Result<Vec<u8>> {
    if data.len() > 40_000_000 {
        return Err("图片过大".into());
    }
    let bytes = STANDARD
        .decode(
            data.strip_prefix("data:image/png;base64,")
                .ok_or("仅支持 PNG 图片")?,
        )
        .map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("无效的 PNG 图片".into());
    }
    Ok(bytes)
}
#[tauri::command]
async fn export_pngs(pages: Vec<String>, language: Option<String>) -> Result<Value> {
    if pages.is_empty() || pages.len() > 200 {
        return Err("请导出 1–200 页图片".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(parent) = rfd::FileDialog::new()
            .set_title(if language.as_deref() == Some("en") { "Save exchange images" } else { "保存分享图片" })
            .pick_folder()
        else {
            return Ok(json!(null));
        };
        let dir = parent.join(format!(
            "品记分享-{}-{}",
            chrono::Local::now().format("%Y%m%d-%H%M%S"),
            &storage::id()[..8]
        ));
        fs::create_dir(&dir).map_err(|e| e.to_string())?;
        for (i, p) in pages.iter().enumerate() {
            storage::atomic_write(&dir.join(format!("品记-{:03}.png", i + 1)), &png_bytes(p)?)
                .map_err(|e| {
                    format!(
                        "部分图片已保存于 {}，第 {} 页失败：{e}",
                        dir.display(),
                        i + 1
                    )
                })?;
        }
        Ok(json!(dir.to_string_lossy()))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn copy_png(data: String) -> Result<()> {
    let bytes = png_bytes(&data)?;
    let img = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: img.width() as usize,
            height: img.height() as usize,
            bytes: Cow::Owned(img.into_raw()),
        })
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            startup,
            pick_vault,
            vault_command,
            backup_vault,
            import_note,
            export_pngs,
            copy_png
        ])
        .run(tauri::generate_context!())
        .expect("无法启动品记");
}
