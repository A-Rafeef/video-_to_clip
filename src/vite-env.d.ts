/// <reference types="vite/client" />

declare module 'mp4box' {
  export const createFile: (keepMdatData?: boolean) => any;
  export const DataStream: any;
  export const ISOFile: any;
  export const Log: any;
  export const BoxParser: any;
  const MP4Box: any;
  export default MP4Box;
}
