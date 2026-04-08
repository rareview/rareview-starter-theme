import { __ } from '@wordpress/i18n';
import { PanelBody, PanelRow } from '@wordpress/components';
import { useState, useEffect } from 'react';
import apiFetch from '@wordpress/api-fetch';
import {
	ANALYTICS_IDS_ENDPOINT,
	ANALYTICS_IDS_STATE_KEY,
	ANALYTICS_GTM_ID_OPTION,
	ANALYTICS_GA_ID_OPTION,
} from '../../../shared/constant';
import TextField from '../../components/global-ui/TextField';

const AnalyticsIds = ({ updateData, isOpen }) => {
	const [state, setState] = useState({});

	useEffect(() => {
		apiFetch({ path: ANALYTICS_IDS_ENDPOINT }).then((data) => {
			setState({ ...data });
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleOnChange = (option, value) => {
		setState({
			...state,
			[option]: value,
		});

		updateData(ANALYTICS_IDS_STATE_KEY, {
			...state,
			[option]: value,
		});
	};

	return (
		<PanelBody
			title={__('Analytics & Verification', 'rv-starter-theme')}
			initialOpen={!!isOpen}
		>
			<PanelRow>
				<div className="rv-starter-theme-options__field-group">
					<TextField
						title={__('Google Tag Manager', 'rv-starter-theme')}
						data={{
							key: ANALYTICS_GTM_ID_OPTION,
							value: state[ANALYTICS_GTM_ID_OPTION],
							placeholder: 'GTM-',
						}}
						onTextChange={handleOnChange}
					/>

					<TextField
						title={__('Google Analytics', 'rv-starter-theme')}
						data={{
							key: ANALYTICS_GA_ID_OPTION,
							value: state[ANALYTICS_GA_ID_OPTION],
							placeholder: 'G-',
						}}
						onTextChange={handleOnChange}
					/>
				</div>
			</PanelRow>
		</PanelBody>
	);
};

export default AnalyticsIds;
