/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * Representational form — no persistence, no network; submit is disabled in the editor.
 *
 * @param {object} props            Block props.
 * @param {string} props.clientId Stable block instance id for unique field ids.
 * @returns {Element} Editor preview.
 */
const InputFieldsExamplesEdit = ({ clientId }) => {
	const blockProps = useBlockProps();
	const uid = `ife-${(clientId || 'block').replace(/[^a-z0-9-]/gi, '')}`;
	const id = (suffix) => `${uid}-${suffix}`;

	return (
		<div {...blockProps}>
			<div className="rv-input-fields-examples">
				<p className="rv-input-fields-examples__notice">
					{__(
						'Demonstration only — this block does not save or send any data.',
						'rv-starter-theme',
					)}
				</p>
				<form
					className="rv-input-fields-examples__form"
					onSubmit={(event) => event.preventDefault()}
				>
					<table
						className="rv-input-fields-examples__table"
						cellSpacing={0}
						cellPadding={0}
					>
						<tbody>
							<tr className="rv-input-fields-examples__row rv-input-fields-examples__row--name-split">
								<td className="rv-input-fields-examples__cell rv-input-fields-examples__cell--half">
									<label htmlFor={id('firstName')}>
										{__('First Name:', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="text"
										id={id('firstName')}
										name={`${uid}-firstName`}
										placeholder={__(
											'Enter your first name',
											'rv-starter-theme',
										)}
										className="rv-input-fields-examples__control"
									/>
								</td>
								<td
									className="rv-input-fields-examples__cell rv-input-fields-examples__cell--gutter"
									aria-hidden="true"
								/>
								<td className="rv-input-fields-examples__cell rv-input-fields-examples__cell--half">
									<label htmlFor={id('lastName')}>
										{__('Last Name:', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="text"
										id={id('lastName')}
										name={`${uid}-lastName`}
										placeholder={__('Enter your last name', 'rv-starter-theme')}
										className="rv-input-fields-examples__control"
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('email')}>
										{__('Email:', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="email"
										id={id('email')}
										name={`${uid}-email`}
										placeholder="your.email@example.com"
										className="rv-input-fields-examples__control"
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('phone')}>
										{__('Phone Number:', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="tel"
										id={id('phone')}
										name={`${uid}-phone`}
										placeholder="+1 (555) 123-4567"
										className="rv-input-fields-examples__control"
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('country')}>
										{__('Country:', 'rv-starter-theme')}
									</label>
									<br />
									<select
										id={id('country')}
										name={`${uid}-country`}
										className="rv-input-fields-examples__control"
										defaultValue=""
									>
										<option value="">
											{__('-- Select Country --', 'rv-starter-theme')}
										</option>
										<option value="us">
											{__('United States', 'rv-starter-theme')}
										</option>
										<option value="uk">
											{__('United Kingdom', 'rv-starter-theme')}
										</option>
										<option value="ca">
											{__('Canada', 'rv-starter-theme')}
										</option>
										<option value="au">
											{__('Australia', 'rv-starter-theme')}
										</option>
										<option value="de">
											{__('Germany', 'rv-starter-theme')}
										</option>
									</select>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('disabled')}>
										{__('disabled', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="text"
										id={id('disabled')}
										name={`${uid}-disabled`}
										className="rv-input-fields-examples__control"
										disabled
										placeholder={__(
											'This field is disabled',
											'rv-starter-theme',
										)}
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<fieldset className="rv-input-fields-examples__fieldset">
										<legend>{__('Gender:', 'rv-starter-theme')}</legend>
										<input
											type="radio"
											id={id('male')}
											name={`${uid}-gender`}
											value="male"
										/>
										<label htmlFor={id('male')}>
											{__('Male', 'rv-starter-theme')}
										</label>
										<br />
										<input
											type="radio"
											id={id('female')}
											name={`${uid}-gender`}
											value="female"
										/>
										<label htmlFor={id('female')}>
											{__('Female', 'rv-starter-theme')}
										</label>
										<br />
										<input
											type="radio"
											id={id('other')}
											name={`${uid}-gender`}
											value="other"
										/>
										<label htmlFor={id('other')}>
											{__('Other', 'rv-starter-theme')}
										</label>
									</fieldset>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<fieldset className="rv-input-fields-examples__fieldset">
										<legend>{__('Interests:', 'rv-starter-theme')}</legend>
										<label
											className="rv-input-fields-examples__choice"
											htmlFor={id('sports')}
										>
											<input
												type="checkbox"
												id={id('sports')}
												name={`${uid}-interests`}
												value="sports"
											/>
											{__('Sports', 'rv-starter-theme')}
										</label>
										<br />
										<label
											className="rv-input-fields-examples__choice"
											htmlFor={id('music')}
										>
											<input
												type="checkbox"
												id={id('music')}
												name={`${uid}-interests`}
												value="music"
											/>
											{__('Music', 'rv-starter-theme')}
										</label>
										<br />
										<label
											className="rv-input-fields-examples__choice"
											htmlFor={id('reading')}
										>
											<input
												type="checkbox"
												id={id('reading')}
												name={`${uid}-interests`}
												value="reading"
											/>
											{__('Reading', 'rv-starter-theme')}
										</label>
										<br />
										<label
											className="rv-input-fields-examples__choice"
											htmlFor={id('travel')}
										>
											<input
												type="checkbox"
												id={id('travel')}
												name={`${uid}-interests`}
												value="travel"
											/>
											{__('Travel', 'rv-starter-theme')}
										</label>
									</fieldset>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('birthdate')}>
										{__('Birth Date:', 'rv-starter-theme')}
									</label>
									<br />
									<input
										type="date"
										id={id('birthdate')}
										name={`${uid}-birthdate`}
										className="rv-input-fields-examples__control"
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<label htmlFor={id('message')}>
										{__('Message:', 'rv-starter-theme')}
									</label>
									<br />
									<textarea
										id={id('message')}
										name={`${uid}-message`}
										rows={8}
										placeholder={__(
											'Enter your message here...',
											'rv-starter-theme',
										)}
										className="rv-input-fields-examples__control"
									/>
								</td>
							</tr>
							<tr>
								<td colSpan={3} className="rv-input-fields-examples__cell">
									<br />
									<input
										type="submit"
										value={__('Submit', 'rv-starter-theme')}
										aria-label={__(
											'Submit (demonstration only, does nothing)',
											'rv-starter-theme',
										)}
									/>
									<input
										type="reset"
										value={__('Reset', 'rv-starter-theme')}
										aria-label={__(
											'Reset (demonstration only)',
											'rv-starter-theme',
										)}
									/>
								</td>
							</tr>
						</tbody>
					</table>
				</form>
			</div>
		</div>
	);
};

export default InputFieldsExamplesEdit;
