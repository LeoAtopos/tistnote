export function isIOSBrowser(device: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">) {
  return /iPad|iPhone|iPod/.test(device.userAgent) || (device.platform === "MacIntel" && device.maxTouchPoints > 1);
}
