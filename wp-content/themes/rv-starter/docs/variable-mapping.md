# Rareview Starter Theme – Variable Mapping User Guide

## VARIOUS


| Label                        | Variable                      | Type    | Default                        |
| ---------------------------- | ----------------------------- | ------- | ------------------------------ |
| Default transition duration  | $default-transition-duration  | string  | 0.2s                           |
| Default transition easing    | $default-transition-easing    | string  | ease-out                       |
| Disabled opacity             | $disabled-opacity             | number  | 0.4                            |
| Container width              | custom.layout.contentSize     | px      | 1440px                         |
| Container side padding       | $container-padding-sides      | string  | var(--wp--preset--spacing--40) |
| Endless fluid responsiveness | $endless-fluid-responsiveness | boolean | true                           |


---

## BODY


| Label                   | Variable               | Type        | Default          |
| ----------------------- | ---------------------- | ----------- | ---------------- |
| Body font family        | $body-font-family      | font-family | Geist Mono |
| Font family (secondary) | $font-family-secondary | font-family | Urbanist   |
| Body line height        | $body-line-height      | number      | 1.3              |
| Body font weight        | $body-font-weight      | number      | 400              |
| Body letter spacing     | $body-letter-spacing   | string      | 0                |


---

## BODY – MOBILE SIZES


| Label                   | Variable                           | Type | Default                                           |
| ----------------------- | ---------------------------------- | ---- | ------------------------------------------------- |
| Body size mobile small  | custom.font-size.mobile.bodySmall  | px   | var(--wp--custom--font-size--mobile--body-small)  |
| Body size mobile medium | custom.font-size.mobile.bodyMedium | px   | var(--wp--custom--font-size--mobile--body-medium) |
| Body size mobile large  | custom.font-size.mobile.bodyLarge  | px   | var(--wp--custom--font-size--mobile--body-large)  |


---

## BODY – DESKTOP SIZES


| Label                    | Variable                            | Type | Default                                            |
| ------------------------ | ----------------------------------- | ---- | -------------------------------------------------- |
| Body size desktop small  | custom.font-size.desktop.bodySmall  | px   | var(--wp--custom--font-size--desktop--body-small)  |
| Body size desktop medium | custom.font-size.desktop.bodyMedium | px   | var(--wp--custom--font-size--desktop--body-medium) |
| Body size desktop large  | custom.font-size.desktop.bodyLarge  | px   | var(--wp--custom--font-size--desktop--body-large)  |


---

## HEADINGS (H1–H6)

### Heading 1


| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-1-font-family            | scss-ref | $font-family-secondary                           |
| Font weight    | $heading-1-font-weight            | number   | 700                                              |
| Line height    | $heading-1-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-1-letter-spacing         | string   | normal                                           |
| Text transform | $heading-1-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading1  | px       | var(--wp--custom--font-size--mobile--heading-1)  |
| Size (desktop) | custom.font-size.desktop.heading1 | px       | var(--wp--custom--font-size--desktop--heading-1) |


### Heading 2–5

(Same structure as H1, using corresponding variables like `$heading-2-*`, `$heading-3-*`, etc.)

### Heading 6


| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-6-font-family            | scss-ref | $body-font-family                                |
| Font weight    | $heading-6-font-weight            | number   | 700                                              |
| Line height    | $heading-6-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-6-letter-spacing         | string   | normal                                           |
| Text transform | $heading-6-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading6  | px       | var(--wp--custom--font-size--mobile--heading-6)  |
| Size (desktop) | custom.font-size.desktop.heading6 | px       | var(--wp--custom--font-size--desktop--heading-6) |


---

## LINKS


| Label            | Variable                    | Type     | Default        |
| ---------------- | --------------------------- | -------- | -------------- |
| Link color       | $color-link                 | scss-ref | $color-primary |
| Link hover color | $color-link-hover           | string   | color-mix(...) |
| Letter spacing   | $link-letter-spacing        | string   | normal         |
| Font weight      | $link-font-weight           | string   | inherit        |
| Text decoration  | $link-text-decoration       | string   | underline      |
| Hover decoration | $link-text-decoration-hover | string   | underline      |


---

## BUTTONS – PRIMARY


| Label          | Variable                         | Type     | Default        |
| -------------- | -------------------------------- | -------- | -------------- |
| Font color     | $button-primary-font-color       | scss-ref | $color-dark    |
| Background     | $button-primary-background-color | scss-ref | $color-primary |
| Height         | $button-primary-height           | rem      | 3.2rem         |
| Border radius  | $button-primary-border-radius    | rem      | 0              |
| Border width   | $button-primary-border-width     | px       | 2px            |
| Padding X      | $button-primary-padding-x        | rem      | 1.5rem         |
| Padding Y      | $button-primary-padding-y        | rem      | 0.5rem         |
| Font size      | $button-primary-font-size        | rem      | 1.125rem       |
| Font weight    | $button-primary-font-weight      | number   | 700            |
| Letter spacing | $button-primary-letter-spacing   | em       | 0.05em         |
| Text transform | $button-primary-text-transform   | string   | uppercase      |


---

## BUTTONS – SECONDARY

(same structure as primary with `$button-secondary-*` variables)

---

## INPUT FIELDS


| Label         | Variable                   | Type | Default |
| ------------- | -------------------------- | ---- | ------- |
| Height        | $input-field-height        | rem  | 3.2rem  |
| Border radius | $input-field-border-radius | rem  | 0       |
| Border width  | $input-field-border-width  | px   | 2px     |


---

## COLORS – MONO


| Label      | Variable           | Type | Default |
| ---------- | ------------------ | ---- | ------- |
| Black      | palette:black      | hex  | #000000 |
| Dark       | palette:dark       | hex  | #1F1F1F |
| Dark Grey  | palette:dark-grey  | hex  | #404040 |
| Grey       | palette:grey       | hex  | #808080 |
| Grey Light | palette:grey-light | hex  | #BFBFBF |
| White      | palette:white      | hex  | #ffffff |


---

## COLORS – BRAND

(Brand 1–10 mapped to `palette:brand-*` with given hex values)

---

## COLORS – THEME


| Label            | Variable          | Type     | Default        |
| ---------------- | ----------------- | -------- | -------------- |
| Primary color    | $color-primary    | scss-ref | $color-brand-1 |
| Secondary color  | $color-secondary  | scss-ref | $color-brand-2 |
| Background color | $color-background | scss-ref | $color-black   |
| Body text color  | $color-body       | scss-ref | $color-white   |


---

## SPACING SCALE


| Label | Variable           | Type | Default |
| ----- | ------------------ | ---- | ------- |
| XS    | $custom.spacing.20 | rem  | 0.25rem |
| SM    | $custom.spacing.30 | rem  | 0.5rem  |
| MD    | $custom.spacing.40 | rem  | 1rem    |
| LG    | $custom.spacing.50 | rem  | 1.5rem  |
| XL    | $custom.spacing.60 | rem  | 2rem    |
| 2XL   | $custom.spacing.70 | rem  | 3rem    |
| 3XL   | $custom.spacing.80 | rem  | 4rem    |


---

## BREAKPOINTS


| Label       | Variable                     | Type | Default |
| ----------- | ---------------------------- | ---- | ------- |
| Desktop XXL | $breakpoint-desktop-xx-large | px   | 1920px  |
| Desktop XL  | $breakpoint-desktop-x-large  | px   | 1600px  |
| Desktop L   | $breakpoint-desktop-large    | px   | 1440px  |
| Desktop     | $breakpoint-desktop          | px   | 1024px  |
| Tablet      | $breakpoint-tablet           | px   | 781px   |
| Mobile      | $breakpoint-mobile           | px   | 500px   |


