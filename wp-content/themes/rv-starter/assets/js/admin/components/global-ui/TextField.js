import { TextControl } from '@wordpress/components';

const TextField = ({ title, data, onTextChange }) => {
	return (
		<TextControl
			label={title}
			value={data.value || ''}
			onChange={(value) => onTextChange(data.key, value)}
			placeholder={data.placeholder}
		/>
	);
};

export default TextField;
