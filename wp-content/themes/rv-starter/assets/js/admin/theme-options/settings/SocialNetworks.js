import { __ } from '@wordpress/i18n';
import { PanelBody, PanelRow } from '@wordpress/components';
import { URLInput } from '@wordpress/block-editor';
import { useState, useEffect } from 'react';
import apiFetch from '@wordpress/api-fetch';
import {
	SOCIAL_NETWORK_ENDPOINT,
	SOCIAL_NETWORK_STATE_KEY,
	SOCIAL_NETWORK_FACEBOOK_URL_OPTION,
	SOCIAL_NETWORK_TWITTER_URL_OPTION,
	SOCIAL_NETWORK_YOUTUBE_URL_OPTION,
	SOCIAL_NETWORK_INSTAGRAM_URL_OPTION,
} from '../../../shared/constant';

const TextField = ({ title, data, onTextChange }) => {
	return (
		<URLInput
			label={title}
			value={data.value}
			onChange={(value) => onTextChange(data.key, value)}
			placeholder="Paste URL"
		/>
	);
};

const SocialNetworks = ({ updateData, isOpen }) => {
	const [state, setState] = useState({});

	useEffect(() => {
		apiFetch({ path: SOCIAL_NETWORK_ENDPOINT }).then((data) => {
			setState({ ...data });
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleOnChange = (option, value) => {
		setState({
			...state,
			[option]: value,
		});

		updateData(SOCIAL_NETWORK_STATE_KEY, {
			...state,
			[option]: value,
		});
	};

	return (
		<PanelBody title={__('Social Networks', 'rv-starter-theme')} initialOpen={!!isOpen}>
			<PanelRow>
				<div className="rv-starter-themeurl-field">
					<TextField
						title={__('Facebook URL', 'rv-starter-theme')}
						data={{
							key: SOCIAL_NETWORK_FACEBOOK_URL_OPTION,
							value: state[SOCIAL_NETWORK_FACEBOOK_URL_OPTION],
						}}
						onTextChange={handleOnChange}
						type="url"
					/>

					<TextField
						title={__('Twitter URL', 'rv-starter-theme')}
						data={{
							key: SOCIAL_NETWORK_TWITTER_URL_OPTION,
							value: state[SOCIAL_NETWORK_TWITTER_URL_OPTION],
						}}
						onTextChange={handleOnChange}
						type="url"
					/>

					<TextField
						title={__('Youtube URL', 'rv-starter-theme')}
						data={{
							key: SOCIAL_NETWORK_YOUTUBE_URL_OPTION,
							value: state[SOCIAL_NETWORK_YOUTUBE_URL_OPTION],
						}}
						onTextChange={handleOnChange}
						type="url"
					/>

					<TextField
						title={__('Instagram URL', 'rv-starter-theme')}
						data={{
							key: SOCIAL_NETWORK_INSTAGRAM_URL_OPTION,
							value: state[SOCIAL_NETWORK_INSTAGRAM_URL_OPTION],
						}}
						onTextChange={handleOnChange}
						type="url"
					/>
				</div>
			</PanelRow>
		</PanelBody>
	);
};

export default SocialNetworks;
