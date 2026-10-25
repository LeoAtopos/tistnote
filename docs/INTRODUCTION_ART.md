# 品记介绍插画

四张人物场景使用内置 imagegen 生成并进行一次线稿简化，素材随应用本地打包，运行时不请求网络。品牌页沿用现有标志制作主题绿色（#344f42）SVG；末页点线书写为原生 SVG + CSS 动画。

| 页 | 素材 | 场景 |
| --- | --- | --- |
| 1 | `public/introduction/brand.svg` | 品记标志与名称 |
| 2 | `public/introduction/conversation.png` | 女孩聊天时突然想不起答案，抬眼、挑起一边眉毛 |
| 3 | `public/introduction/hospital.png` | 虚弱老人躺在医院病床上 |
| 4 | `public/introduction/classroom.png` | 课堂里男孩害羞地看着前排女孩的背影 |
| 5 | `public/introduction/night-desk.png` | 中年人在夜晚的书桌前面对电脑打字 |
| 6 | `src/Introduction.tsx` | 标题线先出现，然后依次写出四行圆点与横线 |

## 生成提示词集

生成方式：内置 `image_gen.imagegen`，每个场景单独生成，随后以生成图为参考简化线稿。未使用 CLI 或 API key。

共同提示：Landscape 3:2 illustration for a Chinese notebook app introduction. 1-bit black-and-white simple pencil drawing on pure white paper. Black linework, no color, no gray washes or gradients. Fresh, restrained editorial sketch, natural realistic human proportions, subtle believable expressions, plenty of white breathing room. No text, captions, lettering, watermark, signatures, logos or UI.

场景 2：A young adult Chinese woman in casual conversation suddenly pauses as though she has forgotten an answer, lifts her eyes upward and raises just one eyebrow. Waist-up three-quarter view, thoughtful and slightly caught off guard. A lightly suggested partner at the edge, minimal everyday background.

场景 3：An elderly Chinese person lies weak and frail in a hospital bed near the end of life. Quiet and dignified, thin face, half-closed eyes, one thin hand on the blanket, pillow, bed rails and a spare IV stand. Wide three-quarter bedside view, vulnerable without gore or melodrama.

场景 4：In an ordinary classroom, a teenage Chinese boy sits at a desk and looks shyly and affectionately at a girl seated in front of him, whose back is visible. A bashful expression, hesitant posture, realistic proportions and modest school clothing. Tender, innocent, no hearts or decorative symbols.

场景 5：A middle-aged Chinese adult sits at a desk at night, facing a computer and actively typing. Three-quarter side view, reflective expression, believable hands. A desk lamp and a night window establish the quiet domestic setting; the monitor has no text or UI.

统一简化提示：Preserve the exact scene, character age, pose, expression and landscape framing. Refine into a much simpler 1-bit black-and-white pencil line drawing. Remove almost all tonal shading, gray washes, paper grain and tiny texture details. Clean black pencil contours on white paper, limited hatching only where necessary. Airy, light, fresh and humane. Preserve readable faces and essential objects, realistic proportions, no anime eyes. No text or logos.

六句文案以 `src/Introduction.tsx` 为准，使用真实界面文字呈现，不烘焙进生成图片，确保中文清晰可读。用户指定的“品好”“么”等用词保留原样；第 2 至第 5 页按最新确认文案更新。
