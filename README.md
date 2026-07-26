# JS-only DataLayer Tracking Project

This is a JS-only dataLayer tracking project for a WordPress shop page.

The script tracks product clicks and form submit attempts. It listens for user actions, finds the correct DOM context, extracts data from the page, validates the data, and pushes clean tracking events into `window.dataLayer`.

The script does not send data to GA4 directly. It only prepares clean tracking events in the dataLayer.

## Project goal

The project was built for learning purposes.

The goal was to practise browser-based tracking logic with JavaScript:

- listening for user actions
- finding the correct DOM context
- extracting product and form data
- validating tracking data before push
- pushing clean events into `window.dataLayer`
- skipping invalid events
- checking form success only after a real success signal appears in the DOM

## Page / environment

Learning WordPress shop page:

https://tracking.com.pl/shop/

The page uses:

- WooCommerce product cards
- WPForms form
- AJAX form submission

## Implemented tracking events

The script uses two document-level listeners:

- product click listener
- form submit listener

### Product events

- `product_link_click`
- `add_to_cart_click`

### Form events

- `form_submit_attempt`
- `form_submit_error`
- `form_submit_success`

## Product tracking logic

For product cards, the script listens for product link clicks and add-to-cart clicks.

When a user clicks a product element, the script checks whether the click was:

- an add-to-cart button click
- a product link click

Then it finds the closest product card context and extracts product data from the DOM:

- product ID
- product SKU
- product name
- product URL
- price
- currency
- discount, if available

After that, the script validates the event data.

If all required data is valid, the script pushes the event into `window.dataLayer`.

If some data is missing or invalid, the script skips the event and logs `failedChecks`.

The product flow builds a `trackingReport` for debugging and QA.

## Form tracking logic

For the form, the script listens for the submit event.

After each submit attempt, the script gets the submitted form, reads the form fields, and builds a `formState`.

The script always creates a `form_submit_attempt` event for every submit attempt.

Then it checks whether all required fields are valid.

If required fields are missing or invalid, the script builds and pushes a `form_submit_error` event into `window.dataLayer`.

If all required fields are valid, the script starts waiting for a success confirmation in the DOM.

For this part, the script uses a `MutationObserver`.

The success evidence is:

- success confirmation container exists
- success message text is not empty

If the success confirmation appears, the script builds and pushes a `form_submit_success` event into `window.dataLayer`.

If the success confirmation does not appear within 5 seconds, the script stops waiting and sets the final decision to `SUCCESS_SIGNAL_TIMEOUT`.

The form flow builds a `processingResult` object for debugging and QA.

## Validation rules

### Product events

For product events:

- `product_id` must be a non-empty string
- `product_sku` must be a non-empty string
- `product_name` must be a non-empty string
- `product_url` must be a non-empty string
- `price` must be a valid number
- `currency` must be a non-empty string
- `page_type` must be a non-empty string

### Form submit attempt event

For `form_submit_attempt`:

- `form_id` must be a non-empty string
- `required_fields_total` must be a valid number
- `required_fields_filled_count` must be a valid number
- `fields_filled_count` must be a valid number
- `all_required_fields_valid` must be a boolean
- `trigger_source` must be `submit_event`
- `page_type` must be a non-empty string

### Form submit error event

For `form_submit_error`:

- `form_id` must be a non-empty string
- `failed_checks` must be a non-empty array
- `required_fields_total` must be a valid number
- `required_fields_filled_count` must be a valid number
- `fields_filled_count` must be a valid number
- `all_required_fields_valid` must be a boolean
- `trigger_source` must be `submit_event`
- `page_type` must be a non-empty string

### Form submit success event

For `form_submit_success`:

- `form_id` must be a non-empty string
- `success_signal` must be `confirmation_container`
- `success_element_id` must be a non-empty string
- `success_message_visible` must be `true`
- `trigger_source` must be `submit_event`
- `page_type` must be a non-empty string

## QA test matrix

### Product QA

1. Click product image

Expected:

- event = `product_link_click`
- `clicked_element_role` = `product_image`
- `pushDecision` = `PUSH`

2. Click product title

Expected:

- event = `product_link_click`
- `clicked_element_role` = `product_title`
- `pushDecision` = `PUSH`

3. Click Add to cart

Expected:

- event = `add_to_cart_click`
- `clicked_element_role` = `add_to_cart_button`
- `pushDecision` = `PUSH`

4. Broken product data

Expected:

- event data is skipped
- no clean product event is pushed into `window.dataLayer`
- `failedChecks` explains why the event was skipped

### Form QA

1. Empty form

Expected:

- `form_submit_attempt` is pushed
- `form_submit_error` is pushed
- `form_submit_success` is not pushed
- `finalDecision` = `ERROR_PUSHED`

2. Invalid email

Expected:

- `form_submit_attempt` is pushed
- `form_submit_error` is pushed
- `failedChecks` includes `email_error`
- `form_submit_success` is not pushed

3. Valid form

Expected:

- `form_submit_attempt` is pushed
- `form_submit_error` is not pushed
- `form_submit_success` is pushed after confirmation
- `finalDecision` = `SUCCESS_PUSHED`

4. Valid form but no success signal

Expected:

- `form_submit_attempt` is pushed
- `form_submit_success` is not pushed
- `finalDecision` = `SUCCESS_SIGNAL_TIMEOUT`

Result:

The script passed all QA checks.

## Known limitations

The script does not send data to GA4 directly.

It only pushes clean tracking events into `window.dataLayer`.

The script depends on the current DOM structure of the learning WordPress page.

The form success logic depends on the WPForms confirmation container appearing in the DOM.

## Engineering conclusions

This project shows how JS-only event tracking can be implemented when built-in tracking tools are not available or not reliable.

The main tracking flow is:

user action → DOM context → data extraction → validation → dataLayer push

The project also shows an important form tracking principle:

A submit attempt is not the same as a successful conversion.

A `form_submit_success` event should be pushed only after a real success confirmation appears in the DOM.
