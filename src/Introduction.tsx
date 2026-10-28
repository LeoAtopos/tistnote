import { tr } from "./i18n";
import { language, theme } from "./preferences";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./components";

export const introductionSeenKey = "tistnote-introduction-seen-v1";

const slides = [
  { image: "brand.svg", alt: "品记标志与名称", caption: "记录品好，建设自我" },
  { image: "conversation.png", alt: "聊天中的女孩突然抬起眼睛，挑起一边的眉毛", caption: "突然被问，最喜欢的5位作家是谁？" },
  { image: "hospital.png", alt: "一位虚弱的老人躺在医院病床上", caption: "最后时刻，最珍视的记忆怎么记不起来了？" },
  { image: "classroom.png", alt: "课堂里的男孩害羞地看着前排女孩的背影", caption: "“最爱音乐人”的品单发给她了，她会回复她的么？" },
  { image: "night-desk.png", alt: "中年人在夜晚的书桌前面对电脑打字", caption: "回顾几年品记历史，发现自己越来越爱大山了。" },
  { image: null, alt: "用点线逐行写出品单的动画", caption: "品记，你的人生值得花时间好好建设" },
];

function WritingIllustration({ active }: { active: boolean }) {
  return (
    <svg className={`intro-writing ${active ? "active" : ""}`} viewBox="0 0 960 640" role="img" aria-label={tr("用点线逐行写出品单的动画")}>
      <path className="intro-stroke" pathLength={1} d="M225 144H665" strokeWidth={9} style={{ animationDelay: "0s" }} />
      {[235, 315, 395, 475].map((y, index) => (
        <g key={y}>
          <circle className="intro-point" cx={233} cy={y} r={7} style={{ animationDelay: `${0.7 + index * 0.75}s` }} />
          <path className="intro-stroke" pathLength={1} d={`M270 ${y}H${[660, 600, 680, 550][index]}`} strokeWidth={4} style={{ animationDelay: `${0.8 + index * 0.75}s` }} />
        </g>
      ))}
    </svg>
  );
}

export function Introduction({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const lastWheel = useRef(0);
  const turn = (offset: number) => setPage((current) => Math.max(0, Math.min(slides.length - 1, current + offset)));
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        turn(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  return (
    <Modal title={tr("关于品记")} onClose={onClose} className="intro-modal">
      <div className="intro-body">
        <div
          className="intro-viewport"
          aria-roledescription={tr("轮播图")}
          aria-label={tr("品记介绍")}
          onPointerDown={(event) => {
            gesture.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) turn(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => { gesture.current = null; }}
          onWheel={(event) => {
            if (Math.abs(event.deltaX) > 40 && Math.abs(event.deltaX) > Math.abs(event.deltaY) && Date.now() - lastWheel.current > 450) {
              lastWheel.current = Date.now();
              turn(event.deltaX > 0 ? 1 : -1);
            }
          }}
        >
          <div className="intro-track" style={{ transform: `translateX(-${page * 100}%)` }}>
            {slides.map((slide, index) => (
              <article className="intro-slide" key={index} data-intro-page={index + 1} aria-hidden={index !== page} inert={index !== page}>
                <div className="intro-art">
                  {slide.image ? (
                    <img src={`${import.meta.env.BASE_URL}introduction/${slide.image === "brand.svg" ? `brand${language() === "en" ? "-en" : ""}${theme() === "dark" ? "-dark" : ""}.svg` : slide.image}`} alt={tr(slide.alt)} draggable={false} />
                  ) : (
                    <WritingIllustration key={page === index ? "playing" : "waiting"} active={page === index} />
                  )}
                </div>
                <h2 className="intro-caption">{tr(slide.caption)}</h2>
              </article>
            ))}
          </div>
        </div>
        <nav className="intro-navigation" aria-label={tr("介绍翻页")}>
          <button disabled={page === 0} onClick={() => turn(-1)}>{tr("上一页")}</button>
          <span className="intro-page-count" aria-live="polite" aria-label={tr("第 {0} 页，共 {1} 页", page + 1, slides.length)}>{page + 1} / {slides.length}</span>
          <button className="primary" onClick={() => page === slides.length - 1 ? onClose() : turn(1)}>
            {page === slides.length - 1 ? tr("开始品记") : tr("下一页")}
          </button>
        </nav>
      </div>
    </Modal>
  );
}
