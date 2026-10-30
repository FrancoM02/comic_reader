export type SeriesKind = 'manga' | 'comic';

export interface Series {
  id: string;
  name: string;
  kind: SeriesKind;
  dir: 'rtl' | 'ltr';
  mode: 'paged' | 'vertical';
  createdAt: number;
}

export interface Volume {
  id: string;
  seriesId: string;
  number: number | null;
  label: string;
  pageCount: number;
  folderId: string;
  pageFileIds: string[];
  thumbFileId: string;
  uploadedAt: number;
}

export interface Library {
  version: 1;
  series: Series[];
  volumes: Volume[];
}

export interface VolumeProgress {
  maxPage: number;
  totalPages: number;
  finished: boolean;
  resetGen: number;
  updatedAt: number;
  deviceId: string;
}

export interface ProgressFile {
  version: 1;
  volumes: Record<string, VolumeProgress>;
}
