import type { AlbumService } from "./albums.types";
// Browsers only see files the person selects; there are no albums to read.
export const albumService: AlbumService = {
  supported: false,
  async list() { return []; },
  async members() { return []; },
};
