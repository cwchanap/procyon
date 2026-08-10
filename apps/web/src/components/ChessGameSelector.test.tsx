import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import ChessGameSelector from './ChessGameSelector';

setupReactDom();

describe('ChessGameSelector', () => {
	test('links all five games explicitly', () => {
		const { getByRole } = render(<ChessGameSelector />);
		expect(
			getByRole('link', { name: /play standard chess/i }).getAttribute('href')
		).toBe('/chess');
		expect(
			getByRole('link', { name: /play chinese chess/i }).getAttribute('href')
		).toBe('/xiangqi');
		expect(
			getByRole('link', { name: /play japanese chess/i }).getAttribute('href')
		).toBe('/shogi');
		expect(
			getByRole('link', { name: /play jungle chess/i }).getAttribute('href')
		).toBe('/jungle');
		expect(
			getByRole('link', { name: /play aeroplane chess/i }).getAttribute('href')
		).toBe('/aeroplane');
	});
});
