import { useCallback, useRef, type MutableRefObject } from 'react';

export function useAiMoveGenerationToken(): {
	genRef: MutableRefObject<number>;
	invalidate(): void;
	isStale(requestId: number | undefined): boolean;
} {
	const genRef = useRef(0);

	const invalidate = useCallback(() => {
		genRef.current += 1;
	}, []);

	const isStale = useCallback((requestId: number | undefined): boolean => {
		return requestId !== undefined && requestId !== genRef.current;
	}, []);

	return { genRef, invalidate, isStale };
}
