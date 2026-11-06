/** Platform words, from what the media library actually returns: iOS has user albums;
 * Android's MediaStore has no albums, only folders (buckets). The browser has neither. */
export const albumsLabel = (os: string) => (os === "android" ? "Folders" : "Albums");
export const albumLabel = (os: string) => (os === "android" ? "folder" : "album");
