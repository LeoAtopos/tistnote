use chrono::Utc;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
pub fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
fn io(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
fn valid_id(s: &str) -> Result<()> {
    Uuid::parse_str(s)
        .map(|_| ())
        .map_err(|_| "无效的记录标识".into())
}
pub fn hash(s: &[u8]) -> String {
    format!("{:x}", Sha256::digest(s))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub ranked: bool,
    pub entries: Vec<Entry>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default = "default_review_months")]
    pub review_interval_months: u32,
    #[serde(default)]
    pub review_test_minute: bool,
    #[serde(default)]
    pub last_reviewed_at: Option<String>,
    pub source: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Record {
    pub note: Note,
    pub revision: String,
    pub warning: Option<String>,
    #[serde(default)]
    pub group: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Version {
    pub id: String,
    pub at: String,
    pub kind: String,
    pub label: String,
    pub note: Note,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub note_id: String,
    pub title: String,
    pub at: String,
    pub kind: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub ranked: bool,
    pub hint: String,
    pub suggested_count: u32,
}
#[derive(Serialize)]
pub struct Vault {
    pub path: String,
    pub notes: Vec<Record>,
    pub trash: Vec<Record>,
    pub templates: Vec<Template>,
    pub warnings: Vec<String>,
    pub groups: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    schema: u32,
    id: String,
    tags: Vec<String>,
    ranked: bool,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_review_months")]
    review_interval_months: u32,
    #[serde(default)]
    review_test_minute: bool,
    #[serde(default)]
    last_reviewed_at: Option<String>,
    source: Option<String>,
}

fn default_review_months() -> u32 {
    3
}
pub fn clean_tags(tags: &mut Vec<String>) {
    let mut seen = HashSet::new();
    *tags = tags
        .iter()
        .map(|x| x.trim().to_owned())
        .filter(|x| !x.is_empty() && seen.insert(x.clone()))
        .collect();
}
fn validate(n: &Note) -> Result<()> {
    valid_id(&n.id)?;
    if !(1..=1200).contains(&n.review_interval_months) {
        return Err("回顾周期需为 1 至 1200 个月".into());
    }
    if let Some(at) = &n.last_reviewed_at {
        chrono::DateTime::parse_from_rfc3339(at).map_err(|_| "回顾时间无法读取".to_string())?;
    }
    if n.title.contains(['\n', '\r']) {
        return Err("主题不能包含换行".into());
    }
    let mut seen = HashSet::new();
    for e in &n.entries {
        valid_id(&e.id)?;
        if !seen.insert(&e.id) {
            return Err("条目标识重复".into());
        }
        if e.name.contains(['\n', '\r']) {
            return Err("条目名称不能包含换行，请将长文本写入理由".into());
        }
    }
    Ok(())
}
pub fn same_content(a: &Note, b: &Note) -> bool {
    a.title == b.title
        && a.description == b.description
        && a.tags == b.tags
        && a.ranked == b.ranked
        && a.entries == b.entries
        && a.review_interval_months == b.review_interval_months
        && a.review_test_minute == b.review_test_minute
}
fn note_title(title: &str) -> &str {
    let title = title.trim();
    if title.is_empty() {
        "未命名笔记"
    } else {
        title
    }
}
fn is_untitled(title: &str) -> bool {
    let title = title.trim();
    title == "未命名笔记"
        || title
            .strip_prefix("未命名笔记（")
            .and_then(|suffix| suffix.strip_suffix('）'))
            .is_some_and(|number| {
                !number.is_empty()
                    && !number.starts_with('0')
                    && number.bytes().all(|b| b.is_ascii_digit())
            })
}

pub fn markdown(n: &Note) -> Result<String> {
    validate(n)?;
    let m = Meta {
        schema: 1,
        id: n.id.clone(),
        tags: n.tags.clone(),
        ranked: n.ranked,
        created_at: n.created_at.clone(),
        updated_at: n.updated_at.clone(),
        review_interval_months: n.review_interval_months,
        review_test_minute: n.review_test_minute,
        last_reviewed_at: n.last_reviewed_at.clone(),
        source: n.source.clone(),
    };
    let mut out = format!(
        "---\n{}\n---\n\n# {}\n\n",
        serde_json::to_string_pretty(&m).map_err(io)?,
        n.title
    );
    for line in n.description.split('\n') {
        out.push_str(&format!("> {line}\n"));
    }
    out.push_str("\n<!-- tistnote:entries -->\n\n");
    for (i, e) in n.entries.iter().enumerate() {
        let prefix = if n.ranked {
            format!("{}.", i + 1)
        } else {
            "-".into()
        };
        out.push_str(&format!(
            "{prefix} {}\n  <!-- tistnote-entry:{} -->\n",
            e.name, e.id
        ));
        for line in e.reason.split('\n') {
            out.push_str(&format!("  > {line}\n"));
        }
        out.push('\n');
    }
    Ok(out)
}
pub fn parse(raw: &str) -> Result<(Note, bool)> {
    let s = raw.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let s = s
        .strip_prefix("---\n")
        .ok_or("不是品记 Markdown：缺少元数据")?;
    let (meta, body) = s.split_once("\n---\n").ok_or("元数据不完整")?;
    let m: Meta = serde_json::from_str(meta).map_err(|e| format!("元数据无法读取：{e}"))?;
    if m.schema != 1 {
        return Err("不支持此文件格式版本".into());
    }
    valid_id(&m.id)?;
    let (head, items) = body
        .split_once("\n<!-- tistnote:entries -->\n")
        .ok_or("缺少列表分隔标记")?;
    let mut lines = head.trim_start_matches('\n').lines();
    let title = lines
        .next()
        .and_then(|x| x.strip_prefix("# "))
        .ok_or("缺少主题标题")?
        .to_string();
    let mut description = Vec::new();
    for line in lines {
        if let Some(v) = line.strip_prefix("> ") {
            description.push(v);
        } else if !line.trim().is_empty() {
            return Err("说明格式无法识别，请保留 > 前缀".into());
        }
    }
    let mut entries: Vec<Entry> = Vec::new();
    let mut reasons: Vec<String> = Vec::new();
    let mut seen_id = false;
    let mut approximate = false;
    fn finish(
        entries: &mut [Entry],
        reasons: &mut Vec<String>,
        seen: bool,
        approximate: &mut bool,
    ) {
        if let Some(e) = entries.last_mut() {
            e.reason = reasons.join("\n");
            if !seen {
                *approximate = true;
            }
        }
        reasons.clear();
    }
    for line in items.lines() {
        if line.is_empty() {
            continue;
        }
        if let Some(v) = line
            .strip_prefix("  <!-- tistnote-entry:")
            .and_then(|x| x.strip_suffix(" -->"))
        {
            valid_id(v)?;
            if seen_id {
                return Err("条目标识重复".into());
            }
            entries.last_mut().ok_or("条目标识没有对应条目")?.id = v.to_owned();
            seen_id = true;
        } else if let Some(v) = line.strip_prefix("  > ") {
            if entries.is_empty() {
                return Err("理由没有对应条目".into());
            }
            reasons.push(v.into());
        } else {
            let name = line
                .strip_prefix("- ")
                .or_else(|| {
                    line.split_once(". ")
                        .filter(|(n, _)| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
                        .map(|(_, v)| v)
                })
                .ok_or("列表格式无法识别，原文件未被修改")?;
            finish(&mut entries, &mut reasons, seen_id, &mut approximate);
            seen_id = false;
            let fallback = Uuid::new_v5(
                &Uuid::parse_str(&m.id).map_err(io)?,
                format!("{}:{name}", entries.len()).as_bytes(),
            )
            .to_string();
            entries.push(Entry {
                id: fallback,
                name: name.into(),
                reason: String::new(),
            });
        }
    }
    finish(&mut entries, &mut reasons, seen_id, &mut approximate);
    let mut n = Note {
        id: m.id,
        title,
        description: description.join("\n"),
        tags: m.tags,
        ranked: m.ranked,
        entries,
        created_at: m.created_at,
        updated_at: m.updated_at,
        review_interval_months: m.review_interval_months,
        review_test_minute: m.review_test_minute,
        last_reviewed_at: m.last_reviewed_at,
        source: m.source,
    };
    clean_tags(&mut n.tags);
    validate(&n)?;
    Ok((n, approximate))
}

// Same-directory temporary file + flush + atomic replacement; original survives a failed write.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("目标路径无效")?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(io)?;
    tmp.write_all(bytes).map_err(io)?;
    tmp.as_file().sync_all().map_err(io)?;
    tmp.persist(path).map_err(io)?;
    Ok(())
}
fn no_links(path: &Path) -> Result<()> {
    for p in path.ancestors() {
        if let Ok(m) = fs::symlink_metadata(p) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if m.file_attributes() & 0x400 != 0 {
                    return Err("资料库不能使用符号链接或目录联接".into());
                }
            }
            if m.file_type().is_symlink() {
                return Err("资料库不能使用符号链接或目录联接".into());
            }
        }
    }
    Ok(())
}
fn read_record(path: &Path) -> Result<Record> {
    no_links(path)?;
    let bytes = fs::read(path).map_err(io)?;
    let raw = std::str::from_utf8(&bytes).map_err(io)?;
    let (note, approx) = parse(raw)?;
    Ok(Record {
        note,
        revision: hash(&bytes),
        group: String::new(),
        warning: if approx {
            Some("部分条目标识缺失，历史比较可能显示为新增或移除。".into())
        } else {
            None
        },
    })
}

fn group_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("请填写分组名称".into());
    }
    for part in name.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.encode_utf16().count() > 255
            || part != part.trim()
            || part.ends_with('.')
            || part
                .chars()
                .any(|c| c.is_control() || "\\<>:\"|?*".contains(c))
            || [
                "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
                "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
                "LPT9",
            ]
            .contains(&stem.as_str())
        {
            return Err(
                "分组名称不能包含路径跳转、Windows 保留名称或非法字符；子分组请用 / 分隔。".into(),
            );
        }
    }
    Ok(name.into())
}
fn scan_notes(folder: &Path) -> Result<(Vec<PathBuf>, Vec<PathBuf>)> {
    fn scan(folder: &Path, files: &mut Vec<PathBuf>, dirs: &mut Vec<PathBuf>) -> Result<()> {
        no_links(folder)?;
        for item in fs::read_dir(folder).map_err(io)? {
            let item = item.map_err(io)?;
            let path = item.path();
            no_links(&path)?;
            if item.file_type().map_err(io)?.is_dir() {
                dirs.push(path.clone());
                scan(&path, files, dirs)?;
            } else if path.extension().is_some_and(|x| x == "md") {
                files.push(path);
            }
        }
        Ok(())
    }
    let (mut files, mut dirs) = (Vec::new(), Vec::new());
    scan(folder, &mut files, &mut dirs)?;
    Ok((files, dirs))
}

pub struct Store {
    pub root: PathBuf,
    _lock: File,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        no_links(path)?;
        fs::create_dir_all(path).map_err(io)?;
        let root = fs::canonicalize(path).map_err(io)?;
        for dir in [
            "notes",
            ".tistnote",
            ".tistnote/history",
            ".tistnote/trash",
            ".tistnote/templates",
            ".tistnote/conflicts",
        ] {
            let p = root.join(dir);
            no_links(&p)?;
            fs::create_dir_all(p).map_err(io)?;
        }
        let lock_path = root.join(".tistnote/vault.lock");
        no_links(&lock_path)?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .map_err(io)?;
        lock.try_lock_exclusive()
            .map_err(|_| "资料库已在另一个品记窗口中打开".to_string())?;
        let manifest = root.join(".tistnote/manifest.json");
        if manifest.exists() {
            let v: serde_json::Value =
                serde_json::from_slice(&fs::read(&manifest).map_err(io)?).map_err(io)?;
            if v["schema"] != 1 {
                return Err("资料库版本不受支持".into());
            }
        } else {
            atomic_write(&manifest, b"{\"schema\":1}")?;
        }
        Ok(Self { root, _lock: lock })
    }
    fn folder(&self, trash: bool) -> PathBuf {
        self.root
            .join(if trash { ".tistnote/trash" } else { "notes" })
    }
    fn locate(&self, note_id: &str, trash: bool) -> Result<PathBuf> {
        valid_id(note_id)?;
        let folder = self.folder(trash);
        no_links(&folder)?;
        let mut found = None;
        for p in scan_notes(&folder)?.0 {
            let matches = match read_record(&p) {
                Ok(r) => r.note.id == note_id,
                Err(_) => p.file_stem().is_some_and(|s| s == note_id),
            };
            if matches {
                if found.is_some() {
                    return Err("资料库存在重复笔记标识".into());
                }
                found = Some(p);
            }
        }
        // Return an unreadable original by its canonical name so revision checks cannot overwrite it.
        if found.is_none() {
            let p = folder.join(format!("{note_id}.md"));
            if p.exists() {
                return Ok(p);
            }
        }
        found.ok_or("笔记文件不存在，可能已在外部移动或删除".into())
    }
    pub fn get(&self, note_id: &str, trash: bool) -> Result<Record> {
        self.read_at(&self.locate(note_id, trash)?, trash)
    }
    fn read_at(&self, path: &Path, trash: bool) -> Result<Record> {
        let mut r = read_record(path)?;
        r.group = path
            .parent()
            .ok_or("笔记路径无效")?
            .strip_prefix(self.folder(trash))
            .map_err(io)?
            .to_string_lossy()
            .replace('\\', "/");
        Ok(r)
    }
    pub fn groups(&self) -> Result<Vec<String>> {
        let folder = self.folder(false);
        let mut groups = scan_notes(&folder)?
            .1
            .into_iter()
            .map(|p| {
                p.strip_prefix(&folder)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .map_err(io)
            })
            .collect::<Result<Vec<_>>>()?;
        groups.sort();
        Ok(groups)
    }
    fn group_folder(&self, name: &str) -> Result<PathBuf> {
        let folder = if name.is_empty() {
            self.folder(false)
        } else {
            self.folder(false).join(group_name(name)?)
        };
        no_links(&folder)?;
        Ok(folder)
    }
    pub fn create_group(&self, name: &str) -> Result<()> {
        let name = group_name(name)?;
        let target = self.group_folder(&name)?;
        if target.exists()
            || self
                .groups()?
                .iter()
                .any(|g| g.to_lowercase() == name.to_lowercase())
        {
            return Err("分组名称已存在".into());
        }
        fs::create_dir_all(target).map_err(io)
    }
    pub fn rename_group(&self, name: &str, new_name: &str) -> Result<()> {
        let name = group_name(name)?;
        let new_name = group_name(new_name)?;
        let source = self.group_folder(&name)?;
        let target = self.group_folder(&new_name)?;
        if name == new_name {
            return Ok(());
        }
        if new_name
            .to_lowercase()
            .starts_with(&format!("{}/", name.to_lowercase()))
        {
            return Err("不能把分组移动到它自己的子分组中".into());
        }
        if !source.is_dir() {
            return Err("分组不存在，请刷新后重试".into());
        }
        if target.exists()
            || self
                .groups()?
                .iter()
                .any(|g| g.to_lowercase() == new_name.to_lowercase())
        {
            return Err("分组名称已存在".into());
        }
        if !target.parent().is_some_and(Path::is_dir) {
            return Err("请先创建目标的父分组".into());
        }
        fs::rename(source, target).map_err(io)
    }
    pub fn delete_group(&self, name: &str) -> Result<()> {
        let name = group_name(name)?;
        let folder = self.group_folder(&name)?;
        if fs::read_dir(&folder).map_err(io)?.next().is_some() {
            return Err("分组不是空的，请先移出笔记并删除子分组。".into());
        }
        fs::remove_dir(folder).map_err(io)
    }
    pub fn move_note(&self, note_id: &str, group: &str, expected: &str) -> Result<Record> {
        let source = self.locate(note_id, false)?;
        let record = self.read_at(&source, false)?;
        if record.revision != expected {
            return Err("CONFLICT:笔记已变化，请先刷新后再移动".into());
        }
        self.ensure_unique_title(&record.note)?;
        let folder = self.group_folder(group)?;
        if !folder.is_dir() {
            return Err("目标分组不存在，请刷新后重试".into());
        }
        if folder == source.parent().ok_or("笔记路径无效")? {
            return Ok(record);
        }
        let target = folder.join(format!("{note_id}.md"));
        no_links(&target)?;
        if target.exists() {
            return Err("目标位置已有同标识文件，未覆盖".into());
        }
        fs::rename(&source, &target).map_err(io)?;
        self.read_at(&target, false)
    }
    pub fn list(&self, recover: bool) -> Result<Vault> {
        let mut v = Vault {
            path: self
                .root
                .to_string_lossy()
                .trim_start_matches("\\\\?\\")
                .into(),
            notes: vec![],
            trash: vec![],
            templates: vec![],
            warnings: vec![],
            groups: self.groups()?,
        };
        for trash in [false, true] {
            let folder = self.folder(trash);
            no_links(&folder)?;
            let mut seen = HashSet::new();
            let mut titles = HashSet::new();
            for p in scan_notes(&folder)?.0 {
                match self.read_at(&p, trash) {
                    Ok(r) => {
                        if !seen.insert(r.note.id.clone()) {
                            v.warnings.push(format!(
                                "重复标识：{}，请先在文件管理器中处理副本",
                                p.display()
                            ));
                            continue;
                        }
                        if recover && !trash {
                            if let Err(e) = self.snapshot(&r.note.id, "recovery", "", false) {
                                v.warnings.push(e);
                            }
                        }
                        if !trash && !titles.insert(note_title(&r.note.title).to_owned()) {
                            v.warnings.push(format!(
                                "标题重复：“{}”，请为同名笔记修改标题。原文件已保留。",
                                r.note.title
                            ));
                        }
                        if trash {
                            v.trash.push(r)
                        } else {
                            v.notes.push(r)
                        }
                    }
                    Err(e) => v.warnings.push(format!(
                        "{}：{e}",
                        p.file_name().unwrap_or_default().to_string_lossy()
                    )),
                }
            }
        }
        let folder = self.root.join(".tistnote/templates");
        no_links(&folder)?;
        for item in fs::read_dir(folder).map_err(io)? {
            let p = item.map_err(io)?.path();
            if p.extension().is_some_and(|x| x == "json") {
                match (|| {
                    no_links(&p)?;
                    serde_json::from_slice::<Template>(&fs::read(&p).map_err(io)?).map_err(io)
                })() {
                    Ok(t) => v.templates.push(t),
                    Err(e) => v.warnings.push(format!("模板无法读取：{e}")),
                }
            }
        }
        Ok(v)
    }
    fn ensure_unique_title(&self, note: &Note) -> Result<()> {
        let folder = self.folder(false);
        no_links(&folder)?;
        for path in scan_notes(&folder)?.0 {
            if path.extension().is_some_and(|x| x == "md") {
                if let Ok(existing) = read_record(&path) {
                    if existing.note.id != note.id
                        && note_title(&existing.note.title) == note_title(&note.title)
                    {
                        return Err(format!(
                            "DUPLICATE_TITLE:已存在标题为“{}”的笔记，请使用其他标题。",
                            note_title(&note.title)
                        ));
                    }
                }
            }
        }
        Ok(())
    }
    pub fn save(&self, n: Note, expected: Option<&str>) -> Result<Record> {
        self.save_in(n, expected, None)
    }
    pub fn save_in(
        &self,
        mut n: Note,
        expected: Option<&str>,
        group: Option<&str>,
    ) -> Result<Record> {
        validate(&n)?;
        clean_tags(&mut n.tags);
        if n.title.trim().is_empty() {
            n.title = "未命名笔记".into();
        }
        // Validate history before replacing the note, so a corrupt log cannot cause a partial save.
        let history_empty = self.versions(&n.id)?.is_empty();
        let located = self.locate(&n.id, false);
        let path = match expected {
            Some(rev) => {
                let p = located.map_err(|e| format!("CONFLICT:{e}"))?;
                no_links(&p)?;
                let bytes = fs::read(&p).map_err(io)?;
                if hash(&bytes) != rev {
                    let conflict =
                        self.root
                            .join(format!(".tistnote/conflicts/{}-{}.md", n.id, id()));
                    no_links(&conflict)?;
                    atomic_write(&conflict, markdown(&n)?.as_bytes())?;
                    return Err(
                        "CONFLICT:文件在外部发生变化。你的编辑已另存到 .tistnote/conflicts。"
                            .into(),
                    );
                }
                p
            }
            None => {
                match &located {
                    Ok(_) => return Err("笔记标识已存在".into()),
                    Err(e) if e != "笔记文件不存在，可能已在外部移动或删除" => {
                        return Err(e.clone())
                    }
                    _ => {}
                }
                let folder = self.group_folder(group.unwrap_or(""))?;
                if !folder.is_dir() {
                    return Err("目标分组不存在，请刷新后重试".into());
                }
                folder.join(format!("{}.md", n.id))
            }
        };
        if expected.is_none() || note_title(&read_record(&path)?.note.title) != note_title(&n.title)
        {
            self.ensure_unique_title(&n)?;
        }
        no_links(&path)?;
        n.updated_at = now();
        atomic_write(&path, markdown(&n)?.as_bytes())?;
        let result = self.read_at(&path, false)?;
        if history_empty && (!is_untitled(&n.title) || n.entries.iter().any(|x| !x.name.is_empty()))
        {
            self.snapshot(&n.id, "initial", "", false)?;
        }
        Ok(result)
    }
    pub fn activity(&self) -> Result<Vec<Activity>> {
        let vault = self.list(false)?;
        let mut events = vec![];
        for record in vault.notes.iter().chain(vault.trash.iter()) {
            let event = |note: &Note, at: String, kind: &str| Activity {
                note_id: note.id.clone(),
                title: note.title.clone(),
                at,
                kind: kind.into(),
            };
            events.push(event(
                &record.note,
                record.note.created_at.clone(),
                "created",
            ));
            let mut previous: Option<Note> = None;
            for version in self.versions(&record.note.id)? {
                if version.kind == "review" {
                    events.push(event(&version.note, version.at.clone(), "reviewed"));
                }
                let local_day = |at: &str| {
                    chrono::DateTime::parse_from_rfc3339(at)
                        .ok()
                        .map(|date| date.with_timezone(&chrono::Local).date_naive())
                };
                let changed = previous.as_ref().map_or_else(
                    || matches!((local_day(&record.note.created_at), local_day(&version.note.updated_at)), (Some(created), Some(updated)) if created != updated),
                    |note| !same_content(note, &version.note),
                );
                if changed {
                    events.push(event(
                        &version.note,
                        version.note.updated_at.clone(),
                        "modified",
                    ));
                }
                previous = Some(version.note);
            }
            if previous
                .as_ref()
                .is_some_and(|n| !same_content(n, &record.note))
            {
                events.push(event(
                    &record.note,
                    record.note.updated_at.clone(),
                    "modified",
                ));
            }
        }
        Ok(events)
    }
    pub fn versions(&self, note_id: &str) -> Result<Vec<Version>> {
        valid_id(note_id)?;
        let dir = self.root.join(".tistnote/history").join(note_id);
        no_links(&dir)?;
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut out = vec![];
        for item in fs::read_dir(dir).map_err(io)? {
            let p = item.map_err(io)?.path();
            if p.extension().is_some_and(|x| x == "json") {
                no_links(&p)?;
                let v: Version = serde_json::from_slice(&fs::read(p).map_err(io)?)
                    .map_err(|e| format!("历史文件损坏，已停止操作：{e}"))?;
                out.push(v);
            }
        }
        out.sort_by(|a, b| a.at.cmp(&b.at).then(a.id.cmp(&b.id)));
        Ok(out)
    }
    pub fn cancel_edit(&self, note: Note, expected: &str, group: &str) -> Result<Record> {
        validate(&note)?;
        let source = self.locate(&note.id, false)?;
        let current = self.read_at(&source, false)?;
        if current.revision != expected {
            return Err("CONFLICT:取消编辑前检测到外部修改，请先处理冲突".into());
        }
        self.ensure_unique_title(&note)?;
        let folder = self.group_folder(group)?;
        if !folder.is_dir() {
            return Err("原分组不存在，请先恢复分组或继续编辑".into());
        }
        let target = folder.join(source.file_name().ok_or("笔记路径无效")?);
        no_links(&target)?;
        let content = markdown(&note)?;
        if source != target {
            if target.exists() {
                return Err("原位置已有文件，取消编辑已停止".into());
            }
            fs::rename(&source, &target).map_err(io)?;
        }
        if let Err(error) = atomic_write(&target, content.as_bytes()) {
            if source != target && (source.exists() || fs::rename(&target, &source).is_err()) {
                return Err(format!(
                    "{error}；当前内容保留在 {}，请检查文件夹。",
                    target.display()
                ));
            }
            return Err(error);
        }
        self.read_at(&target, false)
    }
    pub fn review_note(&self, note_id: &str, expected: &str) -> Result<Record> {
        let path = self.locate(note_id, false)?;
        let mut record = self.read_at(&path, false)?;
        if record.revision != expected {
            return Err("CONFLICT:回顾确认前检测到外部修改，请先刷新笔记".into());
        }
        self.versions(note_id)?;
        let original = fs::read(&path).map_err(io)?;
        if hash(&original) != expected {
            return Err("CONFLICT:回顾确认前检测到外部修改，请先刷新笔记".into());
        }
        record.note.last_reviewed_at = Some(now());
        let reviewed = markdown(&record.note)?;
        atomic_write(&path, reviewed.as_bytes())?;
        if let Err(error) = self.snapshot(note_id, "review", "", true) {
            if hash(&fs::read(&path).map_err(io)?) != hash(reviewed.as_bytes()) {
                return Err("CONFLICT:回顾历史未写入，检测到外部修改；请先刷新笔记".into());
            }
            atomic_write(&path, &original)
                .map_err(|e| format!("回顾历史未写入，恢复原回顾时间失败：{error}；{e}"))?;
            return Err(error);
        }
        self.read_at(&path, false)
    }
    pub fn commit_edit(&self, note_id: &str, expected: &str, label: &str) -> Result<()> {
        let label = label.trim();
        if self.get(note_id, false)?.revision != expected {
            return Err("CONFLICT:提交前检测到外部修改，请先处理冲突".into());
        }
        self.snapshot(note_id, "edit", label, true)
    }
    pub fn snapshot(&self, note_id: &str, kind: &str, label: &str, force: bool) -> Result<()> {
        let record = self.get(note_id, false)?;
        let versions = self.versions(note_id)?;
        if !force
            && versions
                .last()
                .is_some_and(|v| same_content(&v.note, &record.note))
        {
            return Ok(());
        }
        if kind != "edit"
            && kind != "review"
            && versions.is_empty()
            && is_untitled(&record.note.title)
            && record.note.entries.is_empty()
        {
            return Ok(());
        }
        let mut at = now();
        if let Some(last) = versions.last() {
            if at <= last.at {
                let date = chrono::DateTime::parse_from_rfc3339(&last.at).map_err(io)?
                    + chrono::Duration::milliseconds(1);
                at = date
                    .with_timezone(&Utc)
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            }
        }
        let v = Version {
            id: id(),
            at,
            kind: kind.into(),
            label: label.into(),
            note: record.note,
        };
        let dir = self.root.join(".tistnote/history").join(note_id);
        no_links(&dir)?;
        fs::create_dir_all(&dir).map_err(io)?;
        atomic_write(
            &dir.join(format!("{}.json", v.id)),
            &serde_json::to_vec_pretty(&v).map_err(io)?,
        )
    }
    pub fn restore_version(
        &self,
        note_id: &str,
        version_id: &str,
        expected: &str,
    ) -> Result<Record> {
        let old = self
            .versions(note_id)?
            .into_iter()
            .find(|v| v.id == version_id)
            .ok_or("版本不存在")?;
        let current = self.get(note_id, false)?;
        if current.revision != expected {
            return Err("CONFLICT:恢复前检测到外部修改，请先刷新笔记".into());
        }
        let mut restored = old.note;
        restored.last_reviewed_at = current.note.last_reviewed_at;
        self.ensure_unique_title(&restored)?;
        self.snapshot(note_id, "auto", "恢复前", false)?;
        let r = self.save(restored, Some(expected))?;
        self.snapshot(note_id, "restore", "恢复历史版本", true)?;
        Ok(r)
    }
    pub fn move_trash(&self, note_id: &str, restore: bool, expected: &str) -> Result<()> {
        let source = self.locate(note_id, restore)?;
        let record = self.read_at(&source, restore)?;
        if record.revision != expected {
            return Err("CONFLICT:文件已变化，请先刷新".into());
        }
        if restore {
            self.ensure_unique_title(&record.note)?;
        }
        if !restore {
            self.snapshot(note_id, "auto", "移入回收站前", false)?;
        }
        match self.locate(note_id, !restore) {
            Ok(_) => return Err("目标位置已有同标识笔记，未覆盖".into()),
            Err(e) if e != "笔记文件不存在，可能已在外部移动或删除" => {
                return Err(e)
            }
            _ => {}
        }
        let group = if restore && !self.group_folder(&record.group)?.is_dir() {
            ""
        } else {
            &record.group
        };
        let folder = self.folder(!restore).join(group);
        no_links(&folder)?;
        fs::create_dir_all(&folder).map_err(io)?;
        let target = folder.join(format!("{note_id}.md"));
        no_links(&target)?;
        if target.exists() {
            return Err("目标位置已有同标识笔记，未覆盖".into());
        }
        fs::rename(source, target).map_err(io)
    }
    pub fn purge(&self, note_id: &str) -> Result<()> {
        let p = self.locate(note_id, true)?;
        no_links(&p)?;
        let history = self.root.join(".tistnote/history").join(note_id);
        no_links(&history)?;
        fs::remove_file(p).map_err(io)?;
        if history.exists() {
            fs::remove_dir_all(history).map_err(io)?;
        }
        Ok(())
    }
    pub fn put_template(&self, mut t: Template) -> Result<()> {
        valid_id(&t.id)?;
        clean_tags(&mut t.tags);
        if t.title.trim().is_empty() {
            return Err("请填写模板主题".into());
        }
        let p = self.root.join(format!(".tistnote/templates/{}.json", t.id));
        no_links(&p)?;
        atomic_write(&p, &serde_json::to_vec_pretty(&t).map_err(io)?)
    }
    pub fn delete_template(&self, template_id: &str) -> Result<()> {
        valid_id(template_id)?;
        let p = self
            .root
            .join(format!(".tistnote/templates/{template_id}.json"));
        no_links(&p)?;
        fs::remove_file(p).map_err(io)
    }
    pub fn import(&self, path: &Path) -> Result<Record> {
        let mut n = read_record(path)?.note;
        n.id = id();
        n.created_at = now();
        n.updated_at = n.created_at.clone();
        for e in &mut n.entries {
            e.id = id();
        }
        self.save(n, None)
    }
    pub fn backup(&self, parent: &Path) -> Result<PathBuf> {
        copy_vault(&self.root, parent, "品记备份")
    }
}

pub fn copy_vault(source: &Path, parent: &Path, prefix: &str) -> Result<PathBuf> {
    no_links(source)?;
    no_links(parent)?;
    let src = fs::canonicalize(source).map_err(io)?;
    let dest_parent = fs::canonicalize(parent).map_err(io)?;
    if dest_parent.starts_with(&src) {
        return Err("请将备份保存在资料库以外的文件夹".into());
    }
    let target = dest_parent.join(format!(
        "{prefix}-{}-{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        &id()[..8]
    ));
    fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
        no_links(src)?;
        fs::create_dir(dst).map_err(io)?;
        for item in fs::read_dir(src).map_err(io)? {
            let item = item.map_err(io)?;
            let p = item.path();
            no_links(&p)?;
            if item.file_name() == "vault.lock" {
                continue;
            }
            let out = dst.join(item.file_name());
            if item.file_type().map_err(io)?.is_dir() {
                copy_dir(&p, &out)?;
            } else {
                fs::copy(p, out).map_err(io)?;
            }
        }
        Ok(())
    }
    copy_dir(&src, &target)
        .map_err(|e| format!("复制未完成；部分文件保留在 {}：{e}", target.display()))?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn note() -> Note {
        Note {
            id: id(),
            title: "电影 / <最爱>".into(),
            description: "只选反复看过的\n也可以有并列".into(),
            tags: vec![" 电影 ".into(), "电影".into()],
            ranked: true,
            entries: vec![Entry {
                id: id(),
                name: "花样年华".into(),
                reason: "光影\n\n与时间".into(),
            }],
            created_at: now(),
            updated_at: now(),
            review_interval_months: 3,
            review_test_minute: false,
            last_reviewed_at: None,
            source: None,
        }
    }
    #[test]
    fn cancel_edit_restores_autosaved_content_folder_and_timestamps_without_submitting() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("原分组").unwrap();
        s.create_group("新分组").unwrap();
        let mut n = note();
        n.review_interval_months = 6;
        n.last_reviewed_at = Some("2026-01-01T00:00:00Z".into());
        let original = s.save_in(n, None, Some("原分组")).unwrap();
        let mut changed = original.note.clone();
        changed.title = "本次更新".into();
        changed.entries[0].reason = "新的理由".into();
        changed.review_interval_months = 12;
        let changed = s.save(changed, Some(&original.revision)).unwrap();
        let changed = s
            .move_note(&changed.note.id, "新分组", &changed.revision)
            .unwrap();
        s.snapshot(&changed.note.id, "auto", "", false).unwrap();
        let history = s.versions(&changed.note.id).unwrap();
        #[cfg(windows)]
        {
            let path = s.locate(&changed.note.id, false).unwrap();
            let original_permissions = fs::metadata(&path).unwrap().permissions();
            let mut readonly = original_permissions.clone();
            readonly.set_readonly(true);
            fs::set_permissions(&path, readonly).unwrap();
            let result = s.cancel_edit(original.note.clone(), &changed.revision, "原分组");
            let preserved = s.locate(&changed.note.id, false).unwrap();
            fs::set_permissions(&preserved, original_permissions).unwrap();
            assert!(result.is_err());
            assert_eq!(s.get(&changed.note.id, false).unwrap().group, "新分组");
            assert_eq!(
                s.get(&changed.note.id, false).unwrap().revision,
                changed.revision
            );
        }
        let restored = s
            .cancel_edit(original.note.clone(), &changed.revision, "原分组")
            .unwrap();
        assert_eq!(restored.note, original.note);
        assert_eq!(restored.group, "原分组");
        assert_eq!(s.versions(&changed.note.id).unwrap().len(), history.len());
        assert!(history.iter().all(|v| v.kind != "edit"));
        let bytes = fs::read(s.locate(&restored.note.id, false).unwrap()).unwrap();
        assert!(s
            .cancel_edit(original.note.clone(), &changed.revision, "原分组")
            .unwrap_err()
            .starts_with("CONFLICT:"));
        assert_eq!(
            fs::read(s.locate(&restored.note.id, false).unwrap()).unwrap(),
            bytes
        );
        let mut renamed = restored.note.clone();
        renamed.title = "腾出原名称".into();
        let renamed = s.save(renamed, Some(&restored.revision)).unwrap();
        let mut other = note();
        other.title = original.note.title.clone();
        s.save(other, None).unwrap();
        assert!(s
            .cancel_edit(original.note, &renamed.revision, "原分组")
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert_eq!(
            s.get(&renamed.note.id, false).unwrap().revision,
            renamed.revision
        );
    }
    #[test]
    fn one_minute_review_test_option_roundtrips_without_changing_monthly_cycle() {
        let mut n = note();
        n.review_test_minute = true;
        let parsed = parse(&markdown(&n).unwrap()).unwrap().0;
        assert!(parsed.review_test_minute);
        assert_eq!(parsed.review_interval_months, 3);
        let version_note: Note = serde_json::from_value(serde_json::to_value(&n).unwrap()).unwrap();
        assert!(version_note.review_test_minute);
        n.review_test_minute = false;
        assert!(!same_content(&n, &parsed));
    }
    #[test]
    fn review_metadata_survives_markdown_reopen_and_restore_without_content_activity() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("回顾").unwrap();
        let mut n = note();
        n.review_interval_months = 6;
        let original = s.save_in(n, None, Some("回顾")).unwrap();
        let first_version = s.versions(&original.note.id).unwrap()[0].id.clone();
        let events = s.activity().unwrap().len();
        let reviewed = s
            .review_note(&original.note.id, &original.revision)
            .unwrap();
        assert!(reviewed.note.last_reviewed_at.is_some());
        assert_eq!(reviewed.note.updated_at, original.note.updated_at);
        assert_eq!(reviewed.group, "回顾");
        assert_eq!(reviewed.note.review_interval_months, 6);
        assert!(same_content(&reviewed.note, &original.note));
        let activity = s.activity().unwrap();
        assert_eq!(activity.len(), events + 1);
        assert_eq!(activity.iter().filter(|e| e.kind == "reviewed").count(), 1);
        assert_eq!(activity.iter().filter(|e| e.kind == "modified").count(), 0);
        let versions = s.versions(&original.note.id).unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[1].kind, "review");
        assert_eq!(
            versions[1].note.last_reviewed_at,
            reviewed.note.last_reviewed_at
        );
        let reviewed = s
            .review_note(&original.note.id, &reviewed.revision)
            .unwrap();
        let versions = s.versions(&original.note.id).unwrap();
        assert_eq!(versions.iter().filter(|v| v.kind == "review").count(), 2);
        assert_eq!(
            s.activity()
                .unwrap()
                .iter()
                .filter(|e| e.kind == "reviewed")
                .count(),
            2
        );
        let path = s.locate(&original.note.id, false).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(s
            .review_note(&original.note.id, &original.revision)
            .unwrap_err()
            .starts_with("CONFLICT:"));
        assert_eq!(fs::read(&path).unwrap(), bytes);
        let restored = s
            .restore_version(&original.note.id, &first_version, &reviewed.revision)
            .unwrap();
        assert_eq!(
            restored.note.last_reviewed_at,
            reviewed.note.last_reviewed_at
        );
        drop(s);
        let s = Store::open(d.path()).unwrap();
        assert_eq!(
            s.get(&original.note.id, false)
                .unwrap()
                .note
                .last_reviewed_at,
            reviewed.note.last_reviewed_at
        );
        let raw = markdown(&original.note).unwrap();
        let (_, body) = raw
            .strip_prefix("---\n")
            .unwrap()
            .split_once("\n---\n")
            .unwrap();
        let mut meta = serde_json::to_value(&original.note).unwrap();
        meta["schema"] = serde_json::json!(1);
        meta.as_object_mut().unwrap().remove("reviewIntervalMonths");
        meta.as_object_mut().unwrap().remove("lastReviewedAt");
        let legacy = format!("---\n{}\n---\n{}", meta, body);
        let parsed = parse(&legacy).unwrap().0;
        assert_eq!(parsed.review_interval_months, 3);
        assert_eq!(parsed.last_reviewed_at, None);
        let mut invalid = original.note;
        invalid.review_interval_months = 0;
        assert!(s.save(invalid, Some(&restored.revision)).is_err());
        assert_eq!(
            s.get(&restored.note.id, false).unwrap().revision,
            restored.revision
        );
    }
    #[test]
    fn corrupt_review_history_does_not_change_confirmation_time_or_note_bytes() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let record = s.save(note(), None).unwrap();
        let path = s.locate(&record.note.id, false).unwrap();
        let bytes = fs::read(&path).unwrap();
        fs::write(
            s.root
                .join(".tistnote/history")
                .join(&record.note.id)
                .join("broken.json"),
            b"broken",
        )
        .unwrap();
        assert!(s.review_note(&record.note.id, &record.revision).is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    #[test]
    fn edit_commits_keep_optional_logs_after_autosave_and_reject_stale_submissions() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let first = s.save(note(), None).unwrap();
        let mut revised = first.note.clone();
        revised.entries[0].reason = "重看后改变了想法".into();
        let revised = s.save(revised, Some(&first.revision)).unwrap();
        s.snapshot(&revised.note.id, "auto", "", false).unwrap();
        let before = s.versions(&revised.note.id).unwrap().len();
        let bytes = fs::read(s.locate(&revised.note.id, false).unwrap()).unwrap();
        s.commit_edit(
            &revised.note.id,
            &revised.revision,
            "  调整排名\n补充理由  ",
        )
        .unwrap();
        s.commit_edit(&revised.note.id, &revised.revision, "复核当前选择")
            .unwrap();
        s.commit_edit(&revised.note.id, &revised.revision, " \n ")
            .unwrap();
        s.commit_edit(&revised.note.id, &revised.revision, "")
            .unwrap();
        assert!(s
            .commit_edit(&revised.note.id, &first.revision, "过期提交")
            .unwrap_err()
            .starts_with("CONFLICT:"));
        assert_eq!(
            fs::read(s.locate(&revised.note.id, false).unwrap()).unwrap(),
            bytes
        );
        drop(s);
        let s = Store::open(d.path()).unwrap();
        let versions = s.versions(&revised.note.id).unwrap();
        assert_eq!(versions.len(), before + 4);
        assert_eq!(versions[before + 2].label, "");
        assert_eq!(versions[before + 3].label, "");
        assert_eq!(versions[before].kind, "edit");
        assert_eq!(versions[before].label, "调整排名\n补充理由");
        assert_eq!(versions[before].note.entries[0].reason, "重看后改变了想法");
        let mut blank = note();
        blank.title = "未命名笔记".into();
        blank.entries.clear();
        let blank = s.save(blank, None).unwrap();
        s.commit_edit(&blank.note.id, &blank.revision, "留待下次填写")
            .unwrap();
        assert_eq!(s.versions(&blank.note.id).unwrap().len(), 1);
    }
    #[test]
    fn usage_activity_tracks_content_versions_including_trash_without_writing_notes() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let first = s.save(note(), None).unwrap();
        assert_eq!(s.activity().unwrap().len(), 1);
        s.snapshot(&first.note.id, "milestone", "未修改内容", true)
            .unwrap();
        assert_eq!(s.activity().unwrap().len(), 1);
        let mut edited = first.note.clone();
        edited.entries[0].reason = "更改理由".into();
        let edited = s.save(edited, Some(&first.revision)).unwrap();
        let events = s.activity().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[1].kind, "modified");
        assert_eq!(events[1].at, edited.note.updated_at);
        s.snapshot(&first.note.id, "auto", "", false).unwrap();
        assert_eq!(s.activity().unwrap().len(), 2);
        let bytes = fs::read(s.locate(&first.note.id, false).unwrap()).unwrap();
        s.move_trash(&first.note.id, false, &edited.revision)
            .unwrap();
        assert_eq!(s.activity().unwrap().len(), 2);
        assert_eq!(
            fs::read(s.locate(&first.note.id, true).unwrap()).unwrap(),
            bytes
        );
        s.purge(&first.note.id).unwrap();
        assert!(s.activity().unwrap().is_empty());
        let mut delayed = note();
        delayed.title = "未命名笔记".into();
        delayed.entries.clear();
        delayed.created_at = "2020-01-01T00:00:00Z".into();
        let blank = s.save(delayed, None).unwrap();
        let mut filled = blank.note;
        filled.title = "后来填写的主题".into();
        s.save(filled, Some(&blank.revision)).unwrap();
        assert_eq!(s.activity().unwrap().len(), 2);
    }
    #[test]
    fn numbered_untitled_notes_keep_empty_history_until_content_is_added() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        for title in ["未命名笔记", "未命名笔记（1）", "未命名笔记（12）"] {
            let mut n = note();
            n.title = title.into();
            n.entries.clear();
            let r = s.save(n, None).unwrap();
            s.snapshot(&r.note.id, "auto", "", false).unwrap();
            assert!(s.versions(&r.note.id).unwrap().is_empty());
            let mut updated = r.note;
            updated.entries = note().entries;
            s.save(updated.clone(), Some(&r.revision)).unwrap();
            assert_eq!(s.versions(&updated.id).unwrap().len(), 1);
        }
    }
    #[test]
    fn folder_moves_keep_descendants_markdown_and_history_and_never_merge() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("电影/收藏/空组").unwrap();
        s.create_group("设计/收藏").unwrap();
        let r = s.save_in(note(), None, Some("电影/收藏")).unwrap();
        let bytes = fs::read(s.locate(&r.note.id, false).unwrap()).unwrap();
        let history = s.versions(&r.note.id).unwrap()[0].id.clone();
        assert!(s.rename_group("电影/收藏", "设计/收藏").is_err());
        assert!(s.rename_group("电影", "电影/收藏/电影").is_err());
        assert_eq!(s.get(&r.note.id, false).unwrap().group, "电影/收藏");
        s.rename_group("电影", "设计/电影").unwrap();
        assert!(s.groups().unwrap().contains(&"设计/电影/收藏/空组".into()));
        assert_eq!(s.get(&r.note.id, false).unwrap().group, "设计/电影/收藏");
        s.rename_group("设计/电影", "电影").unwrap();
        let moved = s.get(&r.note.id, false).unwrap();
        assert_eq!(moved.group, "电影/收藏");
        assert_eq!(moved.revision, r.revision);
        assert_eq!(
            fs::read(s.locate(&r.note.id, false).unwrap()).unwrap(),
            bytes
        );
        assert_eq!(s.versions(&r.note.id).unwrap()[0].id, history);
    }
    #[test]
    fn groups_move_rename_history_backup_and_reopen_preserve_note_bytes() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("电影/收藏").unwrap();
        s.create_group("待整理").unwrap();
        let r = s.save(note(), None).unwrap();
        let initial = s.versions(&r.note.id).unwrap()[0].id.clone();
        let bytes = fs::read(s.locate(&r.note.id, false).unwrap()).unwrap();
        let moved = s.move_note(&r.note.id, "电影/收藏", &r.revision).unwrap();
        assert_eq!(moved.revision, r.revision);
        assert_eq!(moved.group, "电影/收藏");
        assert!(!s.folder(false).join(format!("{}.md", r.note.id)).exists());
        assert_eq!(
            fs::read(s.locate(&r.note.id, false).unwrap()).unwrap(),
            bytes
        );
        s.rename_group("电影", "影视").unwrap();
        assert_eq!(s.get(&r.note.id, false).unwrap().group, "影视/收藏");
        let mut edited = r.note.clone();
        edited.entries[0].name = "新答案".into();
        let edited = s.save(edited, Some(&r.revision)).unwrap();
        assert_eq!(edited.group, "影视/收藏");
        let restored = s
            .restore_version(&r.note.id, &initial, &edited.revision)
            .unwrap();
        assert_eq!(restored.group, "影视/收藏");
        assert_eq!(restored.note.entries, r.note.entries);
        let out = tempfile::tempdir().unwrap();
        let backup = s.backup(out.path()).unwrap();
        let copy = Store::open(&backup).unwrap();
        assert_eq!(copy.get(&r.note.id, false).unwrap().group, "影视/收藏");
        assert!(copy.groups().unwrap().contains(&"待整理".into()));
        s.delete_group("待整理").unwrap();
        let id = r.note.id;
        drop(s);
        let reopened = Store::open(d.path()).unwrap();
        assert_eq!(reopened.get(&id, false).unwrap().group, "影视/收藏");
        assert_eq!(reopened.list(false).unwrap().notes.len(), 1);
    }
    #[test]
    fn group_titles_are_global_and_failed_operations_do_not_move_or_overwrite_files() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("甲").unwrap();
        s.create_group("乙/子组").unwrap();
        let first = s.save_in(note(), None, Some("甲")).unwrap();
        assert!(s
            .save_in(note(), None, Some("乙/子组"))
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        let mut n = note();
        n.title = "另一个主题".into();
        let second = s.save_in(n, None, Some("乙/子组")).unwrap();
        let mut n = second.note.clone();
        n.title = first.note.title.clone();
        assert!(s
            .save(n, Some(&second.revision))
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert!(s
            .import(&s.locate(&first.note.id, false).unwrap())
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert!(s
            .move_note(&first.note.id, "乙", "stale")
            .unwrap_err()
            .starts_with("CONFLICT:"));
        assert!(s
            .move_note(&first.note.id, "不存在", &first.revision)
            .is_err());
        assert!(s.delete_group("甲").is_err());
        assert!(s.delete_group("乙").is_err());
        assert!(s.rename_group("甲", "乙").is_err());
        assert!(s.rename_group("乙", "乙/子组/循环").is_err());
        let target = s
            .folder(false)
            .join("乙")
            .join(format!("{}.md", first.note.id));
        fs::write(&target, b"unrecognized original").unwrap();
        assert!(s.move_note(&first.note.id, "乙", &first.revision).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"unrecognized original");
        assert!(s
            .folder(false)
            .join("甲")
            .join(format!("{}.md", first.note.id))
            .exists());
        assert_eq!(
            s.get(&second.note.id, false).unwrap().revision,
            second.revision
        );
    }
    #[test]
    fn grouped_trash_restores_original_folder_or_ungrouped_when_folder_removed() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        s.create_group("电影").unwrap();
        let r = s.save_in(note(), None, Some("电影")).unwrap();
        s.move_trash(&r.note.id, false, &r.revision).unwrap();
        assert_eq!(s.list(false).unwrap().trash[0].group, "电影");
        s.move_trash(&r.note.id, true, &r.revision).unwrap();
        assert_eq!(s.get(&r.note.id, false).unwrap().group, "电影");
        s.move_trash(&r.note.id, false, &r.revision).unwrap();
        s.delete_group("电影").unwrap();
        let occupying = s.save(note(), None).unwrap();
        assert!(s
            .move_trash(&r.note.id, true, &r.revision)
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert_eq!(s.get(&r.note.id, true).unwrap().revision, r.revision);
        s.move_trash(&occupying.note.id, false, &occupying.revision)
            .unwrap();
        s.move_trash(&r.note.id, true, &r.revision).unwrap();
        assert_eq!(s.get(&r.note.id, false).unwrap().group, "");
        assert_eq!(s.get(&r.note.id, false).unwrap().revision, r.revision);
    }
    #[test]
    fn group_paths_reject_escape_and_external_folders_are_discovered() {
        for name in [
            "",
            ".",
            "..",
            "../outside",
            "/absolute",
            "电影//收藏",
            "电影/../外部",
            "电影\\外部",
            "C:/外部",
            "CON",
            "com1.md",
            "电影.",
            "电影 /收藏",
            "电影\n收藏",
        ] {
            assert!(group_name(name).is_err(), "accepted {name:?}");
        }
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let external = s.folder(false).join("外部/子组");
        fs::create_dir_all(&external).unwrap();
        let n = note();
        let path = external.join("自定义文件名.md");
        fs::write(&path, markdown(&n).unwrap()).unwrap();
        assert_eq!(s.get(&n.id, false).unwrap().group, "外部/子组");
        assert!(s.groups().unwrap().contains(&"外部/子组".into()));
        assert!(s
            .save(note(), None)
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        fs::write(&path, b"damaged original").unwrap();
        assert_eq!(s.list(false).unwrap().warnings.len(), 1);
        assert!(s.delete_group("外部/子组").is_err());
        assert_eq!(fs::read(&path).unwrap(), b"damaged original");
        let r = s.save_in(note(), None, Some("外部")).unwrap();
        let path = s.locate(&r.note.id, false).unwrap();
        fs::write(&path, b"damaged canonical original").unwrap();
        assert!(s.save(r.note.clone(), Some(&r.revision)).is_err());
        assert!(s.save(r.note, None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"damaged canonical original");
    }
    #[test]
    fn markdown_roundtrip_and_missing_ids() {
        let mut n = note();
        clean_tags(&mut n.tags);
        let md = markdown(&n).unwrap();
        let (parsed, approx) = parse(&md).unwrap();
        assert_eq!(parsed, n);
        assert!(!approx);
        let missing = md
            .lines()
            .filter(|l| !l.contains("tistnote-entry:"))
            .collect::<Vec<_>>()
            .join("\n");
        let (a, approx) = parse(&missing).unwrap();
        assert!(approx);
        assert_eq!(a.entries[0].id, parse(&missing).unwrap().0.entries[0].id);
    }
    #[test]
    fn save_conflict_preserves_both_sides() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let r = s.save(note(), None).unwrap();
        let path = s.locate(&r.note.id, false).unwrap();
        let external = fs::read_to_string(&path)
            .unwrap()
            .replace("花样年华", "重庆森林");
        fs::write(&path, &external).unwrap();
        let mut local = r.note.clone();
        local.entries[0].name = "一一".into();
        assert!(s
            .save(local, Some(&r.revision))
            .unwrap_err()
            .starts_with("CONFLICT:"));
        assert_eq!(fs::read_to_string(path).unwrap(), external);
        assert_eq!(
            fs::read_dir(d.path().join(".tistnote/conflicts"))
                .unwrap()
                .count(),
            1
        );
    }
    #[test]
    fn history_restore_trash_backup() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let r = s.save(note(), None).unwrap();
        let initial = s.versions(&r.note.id).unwrap()[0].id.clone();
        s.snapshot(&r.note.id, "auto", "", false).unwrap();
        assert_eq!(s.versions(&r.note.id).unwrap().len(), 1);
        let mut n = r.note.clone();
        n.entries[0].name = "一一".into();
        let r = s.save(n, Some(&r.revision)).unwrap();
        let r = s
            .restore_version(&r.note.id, &initial, &r.revision)
            .unwrap();
        assert_eq!(r.note.entries[0].name, "花样年华");
        assert_eq!(s.versions(&r.note.id).unwrap().len(), 3);
        s.move_trash(&r.note.id, false, &r.revision).unwrap();
        assert_eq!(s.list(false).unwrap().trash.len(), 1);
        s.move_trash(&r.note.id, true, &r.revision).unwrap();
        let out = tempfile::tempdir().unwrap();
        let b = s.backup(out.path()).unwrap();
        let restored = Store::open(&b).unwrap();
        assert_eq!(restored.list(false).unwrap().notes.len(), 1);
        assert_eq!(restored.versions(&r.note.id).unwrap().len(), 3);
        assert!(s.backup(d.path()).is_err());
    }
    #[test]
    fn corrupt_files_are_not_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let r = s.save(note(), None).unwrap();
        let p = s.locate(&r.note.id, false).unwrap();
        fs::write(&p, "broken").unwrap();
        let v = s.list(true).unwrap();
        assert!(v.notes.is_empty());
        assert_eq!(v.warnings.len(), 1);
        assert!(s.save(r.note, Some(&r.revision)).is_err());
        assert_eq!(fs::read_to_string(p).unwrap(), "broken");
    }
    #[test]
    fn duplicate_entries_rejected_and_single_writer() {
        let mut n = note();
        n.entries.push(n.entries[0].clone());
        assert!(markdown(&n).is_err());
        let d = tempfile::tempdir().unwrap();
        let _s = Store::open(d.path()).unwrap();
        assert!(Store::open(d.path()).is_err());
    }
    #[test]
    fn readonly_write_preserves_original() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("note.md");
        fs::write(&p, b"original").unwrap();
        let mut perms = fs::metadata(&p).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&p, perms).unwrap();
        let result = atomic_write(&p, b"replacement");
        let mut perms = fs::metadata(&p).unwrap().permissions();
        perms.set_readonly(false);
        fs::set_permissions(&p, perms).unwrap();
        assert!(result.is_err());
        assert_eq!(fs::read(&p).unwrap(), b"original");
        assert_eq!(fs::read_dir(d.path()).unwrap().count(), 1);
    }
    #[test]
    fn import_assigns_new_id_and_templates_survive_backup() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let r = s.save(note(), None).unwrap();
        let source = tempfile::tempdir().unwrap();
        let path = source.path().join("import.md");
        let mut incoming = r.note.clone();
        incoming.title = "另一份电影列表".into();
        fs::write(&path, markdown(&incoming).unwrap()).unwrap();
        let imported = s.import(&path).unwrap();
        assert_ne!(r.note.id, imported.note.id);
        assert_ne!(r.note.entries[0].id, imported.note.entries[0].id);
        assert_eq!(r.note.entries[0].name, imported.note.entries[0].name);
        let t = Template {
            id: id(),
            title: "电影".into(),
            description: "".into(),
            tags: vec!["电影".into()],
            ranked: true,
            hint: "想想为什么".into(),
            suggested_count: 5,
        };
        s.put_template(t.clone()).unwrap();
        let out = tempfile::tempdir().unwrap();
        let b = s.backup(out.path()).unwrap();
        let backup = Store::open(&b).unwrap();
        assert_eq!(backup.list(false).unwrap().templates[0].id, t.id);
        s.delete_template(&t.id).unwrap();
        assert!(s.list(false).unwrap().templates.is_empty());
        assert_eq!(backup.list(false).unwrap().templates.len(), 1);
    }
    #[test]
    fn duplicate_titles_block_create_rename_import_and_restore_without_data_loss() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let first = s.save(note(), None).unwrap();
        let mut duplicate = note();
        duplicate.title = format!(" {} ", first.note.title);
        assert!(s
            .save(duplicate, None)
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert!(s
            .import(&s.locate(&first.note.id, false).unwrap())
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        let mut other = note();
        other.title = "不同标题".into();
        let second = s.save(other, None).unwrap();
        let mut renamed = second.note.clone();
        renamed.title = first.note.title.clone();
        assert!(s
            .save(renamed, Some(&second.revision))
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert_eq!(
            s.get(&second.note.id, false).unwrap().revision,
            second.revision
        );
        s.move_trash(&first.note.id, false, &first.revision)
            .unwrap();
        let mut renamed = second.note.clone();
        renamed.title = first.note.title.clone();
        let second = s.save(renamed, Some(&second.revision)).unwrap();
        assert!(s
            .move_trash(&first.note.id, true, &first.revision)
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert_eq!(
            s.get(&first.note.id, true).unwrap().revision,
            first.revision
        );
        let history = s.versions(&first.note.id).unwrap();
        assert_eq!(s.list(false).unwrap().notes.len(), 1);
        let mut renamed = second.note.clone();
        renamed.title = "不同标题".into();
        let second = s.save(renamed, Some(&second.revision)).unwrap();
        s.move_trash(&first.note.id, true, &first.revision).unwrap();
        let old = s.versions(&second.note.id).unwrap()[0].id.clone();
        // Its first version has the distinct title; create a conflicting title before restoring it.
        let mut renamed = first.note.clone();
        renamed.title = "不同标题".into();
        let mut changed = second.note.clone();
        changed.title = "第三个标题".into();
        let second = s.save(changed, Some(&second.revision)).unwrap();
        s.save(renamed, Some(&first.revision)).unwrap();
        assert!(s
            .restore_version(&second.note.id, &old, &second.revision)
            .unwrap_err()
            .starts_with("DUPLICATE_TITLE:"));
        assert_eq!(
            s.get(&second.note.id, false).unwrap().revision,
            second.revision
        );
        assert_eq!(s.versions(&first.note.id).unwrap().len(), history.len());
    }
    #[test]
    fn legacy_duplicate_titles_remain_readable_and_can_be_renamed() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let first = s.save(note(), None).unwrap();
        let mut legacy = note();
        legacy.title = first.note.title.clone();
        let path = s.folder(false).join(format!("{}.md", legacy.id));
        fs::write(&path, markdown(&legacy).unwrap()).unwrap();
        let v = s.list(false).unwrap();
        assert_eq!(v.notes.len(), 2);
        assert!(v.warnings.iter().any(|w| w.contains("标题重复")));
        let record = s.get(&legacy.id, false).unwrap();
        legacy.description = "仍可保存正文".into();
        let record = s.save(legacy.clone(), Some(&record.revision)).unwrap();
        legacy.title = "新的唯一标题".into();
        s.save(legacy, Some(&record.revision)).unwrap();
        assert!(s.list(false).unwrap().warnings.is_empty());
        assert_eq!(
            s.get(&first.note.id, false).unwrap().revision,
            first.revision
        );
    }
    #[test]
    fn duplicate_note_ids_fail_closed() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        let r = s.save(note(), None).unwrap();
        let p = s.locate(&r.note.id, false).unwrap();
        let before = fs::read(&p).unwrap();
        fs::copy(&p, s.folder(false).join("external-copy.md")).unwrap();
        assert!(s.save(r.note.clone(), Some(&r.revision)).is_err());
        assert!(s.save(r.note, None).is_err());
        assert_eq!(fs::read(&p).unwrap(), before);
        assert_eq!(s.list(false).unwrap().warnings.len(), 1);
    }
    #[test]
    fn traversal_and_corrupt_history_are_rejected() {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path()).unwrap();
        assert!(s.versions("../../outside").is_err());
        let r = s.save(note(), None).unwrap();
        let dir = s.root.join(".tistnote/history").join(&r.note.id);
        fs::write(dir.join("broken.json"), b"broken").unwrap();
        let mut n = r.note.clone();
        n.title = "changed".into();
        assert!(s.save(n, Some(&r.revision)).is_err());
        assert_eq!(s.get(&r.note.id, false).unwrap().revision, r.revision);
    }
}
