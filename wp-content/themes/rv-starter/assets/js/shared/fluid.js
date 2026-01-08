import remRootSizes from './fluid/rem-root-sizes';
import fluidTablet from './fluid/fluid-tablet';
import fluidHugeScreen from './fluid/fluid-huge-screen';

const fluidInit = () => {
	const root = document.documentElement;

	remRootSizes(root);
	fluidTablet(root);
	fluidHugeScreen(root);
};

export default fluidInit;
