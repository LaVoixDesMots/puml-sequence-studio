
export type FileNode = {
  type: 'file';
  name: string;
  path: string;        // ex: "source-tpuml/starter/demo.starttpuml"
  content: string|Uint8Array;
};

export type DirNode = {
  type: 'dir';
  name: string;
  path: string;        // ex: "source-tpuml/starter"
  children: Map<string, DirNode|FileNode>;
};