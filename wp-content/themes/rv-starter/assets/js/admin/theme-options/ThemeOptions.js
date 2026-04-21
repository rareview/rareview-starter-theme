import { __ } from '@wordpress/i18n';
import { useState, useEffect } from 'react';
import { Button } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import { ANALYTICS_IDS_ENDPOINT, ANALYTICS_IDS_STATE_KEY } from '../../shared/constant';
import AnalyticsIds from './settings/AnalyticsIds';

import './style.scss';

const ThemeOptions = () => {
	const [isLoading, setIsLoading] = useState(false);
	const [data, setData] = useState({});
	const [noticeType, setNoticeType] = useState('hidden');
	const [noticeMessage, setNoticeMessage] = useState('');
	const dismissNotice = () => {
		setNoticeType('hidden');
		setNoticeMessage('');
	};

	useEffect(() => {
		const dismissButton = document.querySelector('.notice-dismiss');
		dismissButton.addEventListener('click', dismissNotice);
		return () => {
			dismissButton.removeEventListener('click', dismissNotice);
		};
	});

	const updateAPI = (path, payload) => {
		setIsLoading(true);
		apiFetch({
			path,
			method: 'POST',
			data: {
				payload,
			},
		})
			.then(() => {
				setIsLoading(false);
				setNoticeType('success');
				setNoticeMessage(__('Settings saved.', 'rv-starter-theme'));
				window.scrollTo(0, 0);
			})
			.catch((error) => {
				// Handle network errors or other exceptions
				console.error('API request failed:', error); // eslint-disable-line no-console
				setNoticeType('error');
				setNoticeMessage(
					__(
						'Error occurred. Please check console log for more info.',
						'rv-starter-theme',
					),
				);
				setIsLoading(false);
			});
	};

	const changeData = (option, value) => {
		setData({
			...data,
			[option]: value,
		});
	};

	const submitChanges = () => {
		updateAPI(ANALYTICS_IDS_ENDPOINT, data[ANALYTICS_IDS_STATE_KEY]);
	};

	return (
		<div className="rv-starter-theme-options rv-starter-theme-options__main">
			<AnalyticsIds updateData={changeData} isOpen />

			<Button className="button button-primary" onClick={submitChanges}>
				{isLoading ? __('Saving...', 'rv-starter-theme') : __('Save', 'rv-starter-theme')}
			</Button>

			<div className={`notice notice-${noticeType} is-dismissible`}>
				<p>
					<strong>{noticeMessage}</strong>
				</p>
				<button type="button" className="notice-dismiss">
					<span className="screen-reader-text">Dismiss this notice.</span>
				</button>
			</div>
		</div>
	);
};

export default ThemeOptions;
