import type { GraphPoint } from "./template-graph";

export interface CanvasBranch extends GraphPoint { id: string; title: string; parent: string | null }
export interface CanvasNode extends GraphPoint {
  id: string;
  key: string;
  title: string;
  parent: string | null;
  filled: boolean;
  due?: boolean;
  description?: string;
}
