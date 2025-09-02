// This file contains a shared implementation of base64 to uint8Array and uint8Array to base64.
// Because certain text documents may be quite large, we split them into chunks of 8192 bytes to encode/decode.

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const uint8Array = new Uint8Array(binaryString.length);

  const chunkSize = 8192;

  for (let i = 0; i < binaryString.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, binaryString.length);
    for (let j = i; j < end; j++) {
      uint8Array[j] = binaryString.charCodeAt(j);
    }
  }

  return uint8Array;
}

export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binaryString = "";
  const chunkSize = 8192;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binaryString);
}
