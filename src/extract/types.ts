export type Page = { index: number; blob: Blob };
export type Extraction = { total: number; pages: AsyncGenerator<Page> };
