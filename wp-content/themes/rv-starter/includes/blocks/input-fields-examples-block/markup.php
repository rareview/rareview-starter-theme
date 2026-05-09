<?php
/**
 * Input Fields Examples — server render (demonstration markup only).
 *
 * @package RVStarterTheme\Blocks\InputFieldsExamples
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Block content.
 * @var WP_Block $block      Block instance.
 */

$uid = wp_unique_id( 'ife-' );

?>
<div <?php echo get_block_wrapper_attributes(); // phpcs:ignore ?>>
	<div class="rv-input-fields-examples">
		<p class="rv-input-fields-examples__notice">
			<?php esc_html_e( 'Demonstration only — this block does not save or send any data.', 'rv-starter-theme' ); ?>
		</p>
		<form class="rv-input-fields-examples__form" method="post" action="#" onsubmit="return false;">
			<table class="rv-input-fields-examples__table" cellspacing="0" cellpadding="0">
				<tr class="rv-input-fields-examples__row rv-input-fields-examples__row--name-split">
					<td class="rv-input-fields-examples__cell rv-input-fields-examples__cell--half">
						<label for="<?php echo esc_attr( $uid ); ?>-firstName"><?php esc_html_e( 'First Name:', 'rv-starter-theme' ); ?></label><br>
						<input type="text" id="<?php echo esc_attr( $uid ); ?>-firstName" name="<?php echo esc_attr( $uid ); ?>-firstName" placeholder="<?php esc_attr_e( 'Enter your first name', 'rv-starter-theme' ); ?>" class="rv-input-fields-examples__control">
					</td>
					<td class="rv-input-fields-examples__cell rv-input-fields-examples__cell--gutter" aria-hidden="true"></td>
					<td class="rv-input-fields-examples__cell rv-input-fields-examples__cell--half">
						<label for="<?php echo esc_attr( $uid ); ?>-lastName"><?php esc_html_e( 'Last Name:', 'rv-starter-theme' ); ?></label><br>
						<input type="text" id="<?php echo esc_attr( $uid ); ?>-lastName" name="<?php echo esc_attr( $uid ); ?>-lastName" placeholder="<?php esc_attr_e( 'Enter your last name', 'rv-starter-theme' ); ?>" class="rv-input-fields-examples__control">
					</td>
				</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-email"><?php esc_html_e( 'Email:', 'rv-starter-theme' ); ?></label><br>
					<input type="email" id="<?php echo esc_attr( $uid ); ?>-email" name="<?php echo esc_attr( $uid ); ?>-email" placeholder="<?php echo esc_attr( 'your.email@example.com' ); ?>" class="rv-input-fields-examples__control">
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-phone"><?php esc_html_e( 'Phone Number:', 'rv-starter-theme' ); ?></label><br>
					<input type="tel" id="<?php echo esc_attr( $uid ); ?>-phone" name="<?php echo esc_attr( $uid ); ?>-phone" placeholder="<?php echo esc_attr( '+1 (555) 123-4567' ); ?>" class="rv-input-fields-examples__control">
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-country"><?php esc_html_e( 'Country:', 'rv-starter-theme' ); ?></label><br>
					<select id="<?php echo esc_attr( $uid ); ?>-country" name="<?php echo esc_attr( $uid ); ?>-country" class="rv-input-fields-examples__control">
						<option value=""><?php esc_html_e( '-- Select Country --', 'rv-starter-theme' ); ?></option>
						<option value="us"><?php esc_html_e( 'United States', 'rv-starter-theme' ); ?></option>
						<option value="uk"><?php esc_html_e( 'United Kingdom', 'rv-starter-theme' ); ?></option>
						<option value="ca"><?php esc_html_e( 'Canada', 'rv-starter-theme' ); ?></option>
						<option value="au"><?php esc_html_e( 'Australia', 'rv-starter-theme' ); ?></option>
						<option value="de"><?php esc_html_e( 'Germany', 'rv-starter-theme' ); ?></option>
					</select>
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-disabled"><?php esc_html_e( 'Disabled', 'rv-starter-theme' ); ?></label><br>
					<input type="text" id="<?php echo esc_attr( $uid ); ?>-disabled" name="<?php echo esc_attr( $uid ); ?>-disabled" class="rv-input-fields-examples__control" disabled placeholder="<?php esc_attr_e( 'This field is disabled', 'rv-starter-theme' ); ?>">
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<fieldset class="rv-input-fields-examples__fieldset">
						<legend><?php esc_html_e( 'Gender:', 'rv-starter-theme' ); ?></legend>
						<input type="radio" id="<?php echo esc_attr( $uid ); ?>-male" name="<?php echo esc_attr( $uid ); ?>-gender" value="male">
						<label for="<?php echo esc_attr( $uid ); ?>-male"><?php esc_html_e( 'Male', 'rv-starter-theme' ); ?></label><br>
						<input type="radio" id="<?php echo esc_attr( $uid ); ?>-female" name="<?php echo esc_attr( $uid ); ?>-gender" value="female">
						<label for="<?php echo esc_attr( $uid ); ?>-female"><?php esc_html_e( 'Female', 'rv-starter-theme' ); ?></label><br>
						<input type="radio" id="<?php echo esc_attr( $uid ); ?>-other" name="<?php echo esc_attr( $uid ); ?>-gender" value="other">
						<label for="<?php echo esc_attr( $uid ); ?>-other"><?php esc_html_e( 'Other', 'rv-starter-theme' ); ?></label>
					</fieldset>
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<fieldset class="rv-input-fields-examples__fieldset">
						<legend><?php esc_html_e( 'Interests:', 'rv-starter-theme' ); ?></legend>
						<label class="rv-input-fields-examples__choice" for="<?php echo esc_attr( $uid ); ?>-sports">
							<input type="checkbox" id="<?php echo esc_attr( $uid ); ?>-sports" name="<?php echo esc_attr( $uid ); ?>-interests" value="sports">
							<?php esc_html_e( 'Sports', 'rv-starter-theme' ); ?>
						</label><br>
						<label class="rv-input-fields-examples__choice" for="<?php echo esc_attr( $uid ); ?>-music">
							<input type="checkbox" id="<?php echo esc_attr( $uid ); ?>-music" name="<?php echo esc_attr( $uid ); ?>-interests" value="music">
							<?php esc_html_e( 'Music', 'rv-starter-theme' ); ?>
						</label><br>
						<label class="rv-input-fields-examples__choice" for="<?php echo esc_attr( $uid ); ?>-reading">
							<input type="checkbox" id="<?php echo esc_attr( $uid ); ?>-reading" name="<?php echo esc_attr( $uid ); ?>-interests" value="reading">
							<?php esc_html_e( 'Reading', 'rv-starter-theme' ); ?>
						</label><br>
						<label class="rv-input-fields-examples__choice" for="<?php echo esc_attr( $uid ); ?>-travel">
							<input type="checkbox" id="<?php echo esc_attr( $uid ); ?>-travel" name="<?php echo esc_attr( $uid ); ?>-interests" value="travel">
							<?php esc_html_e( 'Travel', 'rv-starter-theme' ); ?>
						</label>
					</fieldset>
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-birthdate"><?php esc_html_e( 'Birth Date:', 'rv-starter-theme' ); ?></label><br>
					<input type="date" id="<?php echo esc_attr( $uid ); ?>-birthdate" name="<?php echo esc_attr( $uid ); ?>-birthdate" class="rv-input-fields-examples__control">
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<label for="<?php echo esc_attr( $uid ); ?>-message"><?php esc_html_e( 'Message:', 'rv-starter-theme' ); ?></label><br>
					<textarea id="<?php echo esc_attr( $uid ); ?>-message" name="<?php echo esc_attr( $uid ); ?>-message" rows="8" placeholder="<?php esc_attr_e( 'Enter your message here...', 'rv-starter-theme' ); ?>" class="rv-input-fields-examples__control"></textarea>
				</td>
			</tr>
			<tr>
				<td colspan="3" class="rv-input-fields-examples__cell">
					<br>
					<input type="submit" class="rv-button--primary" value="<?php echo esc_attr( __( 'Submit', 'rv-starter-theme' ) ); ?>" aria-label="<?php echo esc_attr( __( 'Submit (demonstration only, does nothing)', 'rv-starter-theme' ) ); ?>">
					<input type="reset" class="rv-button--primary--outline" value="<?php echo esc_attr( __( 'Reset', 'rv-starter-theme' ) ); ?>" aria-label="<?php echo esc_attr( __( 'Reset (demonstration only)', 'rv-starter-theme' ) ); ?>">
				</td>
			</tr>
			</table>
		</form>
	</div>
</div>
