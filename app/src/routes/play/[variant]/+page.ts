import { error } from '@sveltejs/kit';
import { VARIANTS } from '#lib/engine/game.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (!VARIANTS[params.variant]) error(404, 'No such game');
	return { variant: params.variant };
};
