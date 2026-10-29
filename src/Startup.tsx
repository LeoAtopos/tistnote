import { useEffect, useState, type ReactNode } from "react";
import { web, preview } from "./api";
import { tr } from "./i18n";
import { introductionArt, introductionImage } from "./introduction-art";

export function Startup({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!web && !preview);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ready) return;
    let active = true;
    setLoaded(0);
    setFailed(false);
    const timer = window.setTimeout(() => { if (active) setFailed(true); }, 20000);
    Promise.all(["brand.svg", ...introductionArt].map(async file => {
      const image = new Image();
      image.src = introductionImage(file);
      await image.decode();
      if (active) setLoaded(count => count + 1);
    })).then(() => {
      if (active) setReady(true);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; clearTimeout(timer); };
  }, [attempt, ready]);
  if (ready) return children;
  return <main className="startup" aria-busy={!failed}>
    <div className="startup-content">
      <img src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" width="72" height="72" />
      <h1>{tr("品记")}</h1>
      <p role="status">{tr(failed ? "图片加载未完成，请检查网络后重试。" : "正在加载引导图片…")}</p>
      <progress aria-label={tr("图片加载进度")} value={loaded} max={5} />
      <p>{loaded} / 5</p>
      {failed && <div className="startup-actions">
        <button className="primary" onClick={() => setAttempt(value => value + 1)}>{tr("重试")}</button>
        <button onClick={() => setReady(true)}>{tr("跳过加载，进入品记")}</button>
      </div>}
    </div>
  </main>;
}
