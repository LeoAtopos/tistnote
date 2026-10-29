import { language, theme } from "./preferences";

export const introductionArt = ["conversation.webp", "hospital.webp", "classroom.webp", "night-desk.webp"];
export function introductionImage(image: string) {
  const file = image === "brand.svg"
    ? `brand${language() === "en" ? "-en" : ""}${theme() === "dark" ? "-dark" : ""}.svg`
    : image;
  return `${import.meta.env.BASE_URL}introduction/${file}`;
}
