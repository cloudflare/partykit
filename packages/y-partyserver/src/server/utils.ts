import { Buffer } from 'buffer';

export function base64ToUint8Array(base64: string): Uint8Array {
	if (typeof Buffer !== 'undefined') {
		return new Uint8Array(Buffer.from(base64, 'base64'));
	}

	const binaryString = atob(base64);
	const uint8Array = new Uint8Array(binaryString.length);
	
	// Process in chunks to avoid creating large intermediate arrays
	const chunkSize = 8192; // Process 8KB at a time
	
	for (let i = 0; i < binaryString.length; i += chunkSize) {
		const end = Math.min(i + chunkSize, binaryString.length);
		for (let j = i; j < end; j++) {
			uint8Array[j] = binaryString.charCodeAt(j);
		}
	}
	
	return uint8Array;
}

export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(uint8Array).toString('base64');
	}

	// Process in chunks to avoid stack overflow on large arrays
	let binaryString = '';
	const chunkSize = 8192; // Process 8KB at a time
	
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		const chunk = uint8Array.slice(i, i + chunkSize);
		binaryString += String.fromCharCode.apply(null, Array.from(chunk));
	}
	
	return btoa(binaryString);
}
