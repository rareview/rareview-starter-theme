# Rareview Starter Theme – Variable Mapping User Guide

## VARIOUS


| Label                        | Variable                      | Type    | Default                        |
| ---------------------------- | ----------------------------- | ------- | ------------------------------ |
| Default transition duration  | $default-transition-duration  | string  | 0.2s                           |
| Default transition easing    | $default-transition-easing    | string  | ease-out                       |
| Disabled opacity             | $disabled-opacity             | number  | 0.4                            |
| Container width              | custom.layout.contentSize     | px      | 1440px                         |
| Container side padding       | $container-padding-sides      | string | var(--wp--preset--spacing--40) |
| Endless fluid responsiveness | $endless-fluid-responsiveness | boolean | true                           |


---

## BODY


| Label                   | Variable               | Type        | Default          |
| ----------------------- | ---------------------- | ----------- | ---------------- |
| Body font family        | settings.typography.fontFamilies | font-family | Geist Mono |
| Font family (secondary) | settings.typography.fontFamilies | font-family | Urbanist   |
| Body line height        | $body-line-height      | number      | 1.3              |
| Body font weight        | $body-font-weight      | number      | 400              |
| Body letter spacing     | $body-letter-spacing   | string      | 0                |


---

## BODY – MOBILE SIZES


| Label                   | Variable                           | Type | Default                                           |
| ----------------------- | ---------------------------------- | ---- | ------------------------------------------------- |
| Body size mobile small  | custom.font-size.mobile.bodySmall  | px | 12px |
| Body size mobile medium | custom.font-size.mobile.bodyMedium | px | 14px |
| Body size mobile large  | custom.font-size.mobile.bodyLarge  | px | 16px |


---

## BODY – DESKTOP SIZES


| Label                    | Variable                            | Type | Default                                            |
| ------------------------ | ----------------------------------- | ---- | -------------------------------------------------- |
| Body size desktop small  | custom.font-size.desktop.bodySmall  | px | 16px |
| Body size desktop medium | custom.font-size.desktop.bodyMedium | px | 18px |
| Body size desktop large  | custom.font-size.desktop.bodyLarge  | px | 20px |


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
| Size (mobile)  | custom.font-size.mobile.heading1  | px | 52px |
| Size (desktop) | custom.font-size.desktop.heading1 | px | 96px |


### Heading 2

| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-2-font-family            | scss-ref | $font-family-secondary                           |
| Font weight    | $heading-2-font-weight            | number   | 700                                              |
| Line height    | $heading-2-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-2-letter-spacing         | string   | normal                                           |
| Text transform | $heading-2-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading2  | px | 48px |
| Size (desktop) | custom.font-size.desktop.heading2 | px | 82px |

### Heading 3

| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-3-font-family            | scss-ref | $font-family-secondary                           |
| Font weight    | $heading-3-font-weight            | number   | 700                                              |
| Line height    | $heading-3-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-3-letter-spacing         | string   | normal                                           |
| Text transform | $heading-3-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading3  | px | 44px |
| Size (desktop) | custom.font-size.desktop.heading3 | px | 60px |

### Heading 4

| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-4-font-family            | scss-ref | $font-family-secondary                           |
| Font weight    | $heading-4-font-weight            | number   | 700                                              |
| Line height    | $heading-4-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-4-letter-spacing         | string   | normal                                           |
| Text transform | $heading-4-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading4  | px | 38px |
| Size (desktop) | custom.font-size.desktop.heading4 | px | 50px |

### Heading 5

| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-5-font-family            | scss-ref | $font-family-secondary                           |
| Font weight    | $heading-5-font-weight            | number   | 700                                              |
| Line height    | $heading-5-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-5-letter-spacing         | string   | normal                                           |
| Text transform | $heading-5-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading5  | px | 24px |
| Size (desktop) | custom.font-size.desktop.heading5 | px | 40px |

### Heading 6


| Label          | Variable                          | Type     | Default                                          |
| -------------- | --------------------------------- | -------- | ------------------------------------------------ |
| Font family    | $heading-6-font-family            | scss-ref | $body-font-family                                |
| Font weight    | $heading-6-font-weight            | number   | 700                                              |
| Line height    | $heading-6-line-height            | number   | 1.3                                              |
| Letter spacing | $heading-6-letter-spacing         | string   | normal                                           |
| Text transform | $heading-6-text-transform         | string   | none                                             |
| Size (mobile)  | custom.font-size.mobile.heading6  | px | 16px |
| Size (desktop) | custom.font-size.desktop.heading6 | px | 24px |


---

## LINKS


| Label            | Variable                    | Type     | Default        |
| ---------------- | --------------------------- | -------- | -------------- |
| Link color       | $link-color                 | scss-ref | $color-primary |
| Link hover color | $link-hover-color           | string   | color-mix(in srgb, $color-primary 80%, white) |
| Letter spacing   | $link-letter-spacing        | string   | normal         |
| Font weight      | $link-font-weight           | string   | inherit        |
| Text decoration  | $link-text-decoration       | string   | underline      |
| Hover decoration | $link-hover-text-decoration | string   | underline      |


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

| Label          | Variable                           | Type     | Default          |
| -------------- | ---------------------------------- | -------- | ---------------- |
| Font color     | $button-secondary-font-color       | scss-ref | $color-dark      |
| Background     | $button-secondary-background-color | scss-ref | $color-secondary |
| Height         | $button-secondary-height           | rem      | 3.2rem           |
| Border radius  | $button-secondary-border-radius    | rem      | 0                |
| Border width   | $button-secondary-border-width     | px       | 2px              |
| Padding X      | $button-secondary-padding-x        | rem      | 1.5rem           |
| Padding Y      | $button-secondary-padding-y        | rem      | 0.5rem           |
| Font size      | $button-secondary-font-size        | rem      | 1.125rem         |
| Font weight    | $button-secondary-font-weight      | number   | 700              |
| Letter spacing | $button-secondary-letter-spacing   | em       | 0.05em           |
| Text transform | $button-secondary-text-transform   | string   | uppercase        |

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

| Label          | Variable        | Type | Default |
| -------------- | --------------- | ---- | ------- |
| Brand Color 1  | palette:brand-1 | hex  | #00F700 |
| Brand Color 2  | palette:brand-2 | hex  | #61DAFB |
| Brand Color 3  | palette:brand-3 | hex  | #00585f |
| Brand Color 4  | palette:brand-4 | hex  | #5794f7 |
| Brand Color 5  | palette:brand-5 | hex  | #afbccf |
| Brand Color 6  | palette:brand-6 | hex  | #2f3464 |
| Brand Color 7  | palette:brand-7 | hex  | #4ba9ce |
| Brand Color 8  | palette:brand-8 | hex  | #99dfe5 |
| Brand Color 9  | palette:brand-9 | hex  | #67ce67 |
| Brand Color 10 | palette:brand-10 | hex | #d9edff |

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


