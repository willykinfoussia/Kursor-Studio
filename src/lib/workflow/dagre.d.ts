declare module "@dagrejs/dagre" {
  interface DagreGraph {
    setDefaultEdgeLabel: (fn: () => object) => void;
    setGraph: (graph: object) => void;
    setNode: (id: string, label: object) => void;
    setEdge: (source: string, target: string) => void;
    hasNode: (id: string) => boolean;
    node: (id: string) => { x: number; y: number; width?: number; height?: number };
  }

  const dagre: {
    graphlib: { Graph: new () => DagreGraph };
    layout: (graph: DagreGraph) => void;
  };

  export default dagre;
}
