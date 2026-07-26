// @ts-check

window.dataLayer = window.dataLayer || [];

let activeFormObserver = null;
let activeFormObserverTimeoutId = null;

// =========================
// Product tracking
// =========================

document.addEventListener('click', function (event) {
    const clickedElement = event.target;

    if (!clickedElement) {
        console.log('clicked_element_not_found');
        return;
    }

    const buttonCartClick = clickedElement.closest('.add_to_cart_button');

    let currentContext = null;
    let eventBasisData = null;

    if (buttonCartClick) {
        currentContext = buttonCartClick.closest('.product');

        eventBasisData = {
            currentEvent: 'add_to_cart_click',
            clickedElementRole: 'add_to_cart_button',
            pageType: 'shop_page'
        };
    } else if (clickedElement.closest('a[href*="/product/"]')) {
        // event.preventDefault(); // Use only for testing product link clicks.

        const linkClick = clickedElement.closest('a[href*="/product/"]');

        currentContext = linkClick.closest('.product');

        let clickedElementRole = 'product_card_link';

        if (linkClick.closest('.wc-block-components-product-image')) {
            clickedElementRole = 'product_image';
        } else if (linkClick.closest('.wp-block-post-title')) {
            clickedElementRole = 'product_title';
        }

        eventBasisData = {
            currentEvent: 'product_link_click',
            clickedElementRole: clickedElementRole,
            pageType: 'shop_page'
        };
    } else {
        return;
    }

    if (!currentContext) {
        console.warn('product_context_not_found');
        return;
    }

    const eventData = extractProductEventData(currentContext, eventBasisData);
    const trackingReport = validateProductEvent(eventData, clickedElement);

    processPushDecision(trackingReport, eventData);
});

// =========================
// Form tracking
// =========================

document.addEventListener('submit', function (event) {
    const pageType = 'shop_page';
    const triggerSource = 'submit_event';

    const processingResult = {
        attemptEvent: null,
        errorEvent: null,
        successEvent: null,
        failedChecks: [],
        finalDecision: 'SKIP'
    };

    const formContext = {
        formId: null,
        pageType: pageType,
        triggerSource: triggerSource,
        processingResult: processingResult
    };

    const currentForm = event.target;
    const formId = currentForm.getAttribute('id')?.trim();

    if (!formId) {
        console.warn('form_id_error');
        return;
    }

    formContext.formId = formId;

    const formState = getFormState(currentForm);
    const {
        allRequiredFieldsValid,
        failedChecks
    } = formState;

    processingResult.failedChecks = failedChecks;

    processAttemptEvent(formState, formContext);

    if (allRequiredFieldsValid === false) {
        processFormErrorEvent(formState, formContext);
    }

    if (allRequiredFieldsValid === true) {
        startSuccessObserver(formContext);
    }
}, true);

// =========================
// Shared helpers
// =========================

function isStringNonEmpty(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isValueNumber(value) {
    return typeof value === 'number' && !Number.isNaN(value);
}

// =========================
// Product functions
// =========================

function processPrice(priceContext) {
    let rawPrice = null;
    let rawOldPrice = null;
    let productCurrency = null;

    if (priceContext?.querySelector('ins')) {
        rawPrice =
            priceContext
                .querySelector('ins .woocommerce-Price-amount')
                ?.textContent
                ?.trim() || null;

        rawOldPrice =
            priceContext
                .querySelector('del .woocommerce-Price-amount')
                ?.textContent
                ?.trim() || null;

        productCurrency =
            priceContext
                .querySelector('ins .woocommerce-Price-currencySymbol')
                ?.textContent
                ?.trim() || null;
    } else {
        rawPrice =
            priceContext
                ?.querySelector('.woocommerce-Price-amount')
                ?.textContent
                ?.trim() || null;

        productCurrency =
            priceContext
                ?.querySelector('.woocommerce-Price-currencySymbol')
                ?.textContent
                ?.trim() || null;
    }

    const textPrice = isStringNonEmpty(rawPrice)
        ? rawPrice
            .replace(productCurrency, '')
            .replace(',', '.')
            .replaceAll(' ', '')
            .replaceAll('\u00a0', '')
        : null;

    const numericPrice = isStringNonEmpty(textPrice)
        ? Number(textPrice)
        : NaN;

    const productPrice = !Number.isNaN(numericPrice)
        ? numericPrice
        : null;

    const textOldPrice = isStringNonEmpty(rawOldPrice)
        ? rawOldPrice
            .replace(productCurrency, '')
            .replace(',', '.')
            .replaceAll(' ', '')
            .replaceAll('\u00a0', '')
        : null;

    const numericOldPrice = isStringNonEmpty(textOldPrice)
        ? Number(textOldPrice)
        : NaN;

    const productOldPrice = !Number.isNaN(numericOldPrice)
        ? numericOldPrice
        : null;

    let discount = null;

    if (
        isValueNumber(productPrice) &&
        isValueNumber(productOldPrice)
    ) {
        discount = productOldPrice - productPrice;
    }

    return {
        productPrice,
        discount,
        productCurrency
    };
}

function extractProductEventData(currentContext, eventBasisData) {
    const productNameContext =
        currentContext.querySelector('.wp-block-post-title');

    const rawProductText = productNameContext?.textContent?.trim();
    const rawProductName = rawProductText || null;

    const rawUrl =
        currentContext.querySelector('a[href*="/product/"]')?.href;

    const rawProductUrl = rawUrl || null;

    const priceContext =
        currentContext.querySelector('.wc-block-components-product-price');

    const {
        productPrice,
        discount,
        productCurrency
    } = processPrice(priceContext);

    const buttonContext =
        currentContext.querySelector('.add_to_cart_button');

    const productId = buttonContext?.dataset?.product_id || null;
    const productSku = buttonContext?.dataset?.product_sku || null;

    const eventData = {
        event: eventBasisData.currentEvent,
        product_id: productId,
        product_name: rawProductName,
        product_sku: productSku,
        product_url: rawProductUrl,
        price: productPrice,
        discount: discount,
        currency: productCurrency,
        page_type: eventBasisData.pageType,
        trigger_source: 'click_event',
        clicked_element_role: eventBasisData.clickedElementRole
    };

    return eventData;
}

function validateProductEvent(eventData, clickedElement) {
    const failedChecks = [];

    if (!isStringNonEmpty(eventData.product_name)) {
        failedChecks.push('product_name_invalid_or_missing');
    }

    if (!isStringNonEmpty(eventData.product_url)) {
        failedChecks.push('product_url_invalid_or_missing');
    }

    if (!isValueNumber(eventData.price)) {
        failedChecks.push('product_price_invalid_or_missing');
    }

    if (!isStringNonEmpty(eventData.currency)) {
        failedChecks.push('product_currency_invalid_or_missing');
    }

    if (!isStringNonEmpty(eventData.product_id)) {
        failedChecks.push('product_id_invalid_or_missing');
    }

    if (!isStringNonEmpty(eventData.product_sku)) {
        failedChecks.push('product_sku_invalid_or_missing');
    }

    if (!isStringNonEmpty(eventData.page_type)) {
        failedChecks.push('page_type_invalid_or_missing');
    }

    const pushDecision = failedChecks.length > 0
        ? 'SKIP'
        : 'PUSH';

    const trackingReport = {
        eventData: eventData,
        pushDecision: pushDecision,
        failedChecks: failedChecks,
        clickedElementTag: clickedElement?.tagName
    };

    return trackingReport;
}

function processPushDecision(trackingReport, eventData) {
    if (trackingReport.pushDecision === 'PUSH') {
        window.dataLayer.push(eventData);
        console.log('eventData was PUSHED into dataLayer:', eventData);
        console.log('trackingReport:', trackingReport);
    } else {
        console.log('eventData was SKIPPED:', eventData);
        console.log('trackingReport:', trackingReport);
    }
}

// =========================
// Form functions
// =========================

function getFormState(currentForm) {
    const firstNameField =
        currentForm.querySelector('input[name="wpforms[fields][1][first]"]');

    const lastNameField =
        currentForm.querySelector('input[name="wpforms[fields][1][last]"]');

    const emailField =
        currentForm.querySelector('input[name="wpforms[fields][2]"]');

    const messageField =
        currentForm.querySelector('textarea[name="wpforms[fields][3]"]');

    const firstNameFieldFilled = isStringNonEmpty(firstNameField?.value);
    const lastNameFieldFilled = isStringNonEmpty(lastNameField?.value);

    const emailFieldValid =
        isStringNonEmpty(emailField?.value) &&
        emailField.value.includes('@');

    const messageFieldFilled = isStringNonEmpty(messageField?.value);

    const requiredFieldsTotal = 3;

    let fieldsFilledCount = 0;
    let requiredFieldsFilledCount = 0;

    const failedChecks = [];

    if (firstNameFieldFilled) {
        fieldsFilledCount++;
        requiredFieldsFilledCount++;
    } else {
        failedChecks.push('first_name_error');
    }

    if (lastNameFieldFilled) {
        fieldsFilledCount++;
        requiredFieldsFilledCount++;
    } else {
        failedChecks.push('last_name_error');
    }

    if (emailFieldValid) {
        fieldsFilledCount++;
        requiredFieldsFilledCount++;
    } else {
        failedChecks.push('email_error');
    }

    if (messageFieldFilled) {
        fieldsFilledCount++;
    }

    const allRequiredFieldsValid =
        requiredFieldsTotal === requiredFieldsFilledCount;

    return {
        requiredFieldsTotal,
        fieldsFilledCount,
        requiredFieldsFilledCount,
        allRequiredFieldsValid,
        failedChecks
    };
}

function processAttemptEvent(formState, formContext) {
    const {
        requiredFieldsTotal,
        fieldsFilledCount,
        requiredFieldsFilledCount,
        allRequiredFieldsValid
    } = formState;

    const {
        formId,
        pageType,
        triggerSource,
        processingResult
    } = formContext;

    const attemptEventData = {
        event: 'form_submit_attempt',
        form_id: formId,
        required_fields_total: requiredFieldsTotal,
        required_fields_filled_count: requiredFieldsFilledCount,
        fields_filled_count: fieldsFilledCount,
        all_required_fields_valid: allRequiredFieldsValid,
        trigger_source: triggerSource,
        page_type: pageType
    };

    const attemptEvent = {
        eventData: attemptEventData,
        validationResult: {
            valid: null,
            failedChecks: []
        },
        pushDecision: null
    };

    if (attemptEventData.event !== 'form_submit_attempt') {
        attemptEvent.validationResult.failedChecks.push('invalid_submit_attempt');
    }

    if (!isStringNonEmpty(attemptEventData.form_id)) {
        attemptEvent.validationResult.failedChecks.push('invalid_id');
    }

    if (!isValueNumber(attemptEventData.required_fields_total)) {
        attemptEvent.validationResult.failedChecks.push('invalid_required_fields_total');
    }

    if (!isValueNumber(attemptEventData.required_fields_filled_count)) {
        attemptEvent.validationResult.failedChecks.push('invalid_required_fields_filled_count');
    }

    if (!isValueNumber(attemptEventData.fields_filled_count)) {
        attemptEvent.validationResult.failedChecks.push('invalid_fields_filled_count');
    }

    if (typeof attemptEventData.all_required_fields_valid !== 'boolean') {
        attemptEvent.validationResult.failedChecks.push('invalid_all_required_fields_valid');
    }

    if (attemptEventData.trigger_source !== 'submit_event') {
        attemptEvent.validationResult.failedChecks.push('invalid_trigger_source');
    }

    if (!isStringNonEmpty(attemptEventData.page_type)) {
        attemptEvent.validationResult.failedChecks.push('invalid_page_type');
    }

    if (attemptEvent.validationResult.failedChecks.length > 0) {
        attemptEvent.validationResult.valid = false;
        attemptEvent.pushDecision = 'SKIP';
    } else {
        attemptEvent.validationResult.valid = true;
        attemptEvent.pushDecision = 'PUSH';
    }

    processingResult.attemptEvent = attemptEvent;

    if (processingResult.attemptEvent.pushDecision === 'PUSH') {
        window.dataLayer.push(attemptEventData);
    }

    console.log('attemptEvent:', processingResult.attemptEvent);
}

function processFormErrorEvent(formState, formContext) {
    const {
        requiredFieldsTotal,
        fieldsFilledCount,
        requiredFieldsFilledCount,
        allRequiredFieldsValid,
        failedChecks
    } = formState;

    const {
        formId,
        pageType,
        triggerSource,
        processingResult
    } = formContext;

    const errorEventData = {
        event: 'form_submit_error',
        form_id: formId,
        failed_checks: failedChecks,
        required_fields_total: requiredFieldsTotal,
        fields_filled_count: fieldsFilledCount,
        required_fields_filled_count: requiredFieldsFilledCount,
        all_required_fields_valid: allRequiredFieldsValid,
        trigger_source: triggerSource,
        page_type: pageType
    };

    const errorEvent = {
        eventData: errorEventData,
        validationResult: {
            valid: null,
            failedChecks: []
        },
        pushDecision: null
    };

    if (errorEventData.event !== 'form_submit_error') {
        errorEvent.validationResult.failedChecks.push('invalid_submit_error');
    }

    if (!isStringNonEmpty(errorEventData.form_id)) {
        errorEvent.validationResult.failedChecks.push('invalid_id');
    }

    if (
        !Array.isArray(errorEventData.failed_checks) ||
        errorEventData.failed_checks.length === 0
    ) {
        errorEvent.validationResult.failedChecks.push('invalid_failed_checks');
    }

    if (!isValueNumber(errorEventData.required_fields_total)) {
        errorEvent.validationResult.failedChecks.push('invalid_required_fields_total');
    }

    if (!isValueNumber(errorEventData.required_fields_filled_count)) {
        errorEvent.validationResult.failedChecks.push('invalid_required_fields_filled_count');
    }

    if (!isValueNumber(errorEventData.fields_filled_count)) {
        errorEvent.validationResult.failedChecks.push('invalid_fields_filled_count');
    }

    if (typeof errorEventData.all_required_fields_valid !== 'boolean') {
        errorEvent.validationResult.failedChecks.push('invalid_all_required_fields_valid');
    }

    if (errorEventData.trigger_source !== 'submit_event') {
        errorEvent.validationResult.failedChecks.push('invalid_trigger_source');
    }

    if (!isStringNonEmpty(errorEventData.page_type)) {
        errorEvent.validationResult.failedChecks.push('invalid_page_type');
    }

    if (errorEvent.validationResult.failedChecks.length > 0) {
        errorEvent.validationResult.valid = false;
        errorEvent.pushDecision = 'SKIP';
    } else {
        errorEvent.validationResult.valid = true;
        errorEvent.pushDecision = 'PUSH';
    }

    processingResult.errorEvent = errorEvent;

    if (processingResult.errorEvent.pushDecision === 'PUSH') {
        window.dataLayer.push(errorEventData);
        processingResult.finalDecision = 'ERROR_PUSHED';
    }

    console.log('errorEvent:', processingResult.errorEvent);
    console.log('processingResult:', processingResult);
}

function startSuccessObserver(formContext) {
    if (activeFormObserver !== null) {
        activeFormObserver.disconnect();
        activeFormObserver = null;
    }

    if (activeFormObserverTimeoutId !== null) {
        clearTimeout(activeFormObserverTimeoutId);
        activeFormObserverTimeoutId = null;
    }

    activeFormObserver = new MutationObserver(
        function (mutationsList, observerInstance) {
            handleMutations(mutationsList, observerInstance, formContext);
        }
    );

    activeFormObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    activeFormObserverTimeoutId = setTimeout(function () {
        if (activeFormObserver !== null) {
            activeFormObserver.disconnect();
            activeFormObserver = null;
        }

        activeFormObserverTimeoutId = null;
        formContext.processingResult.finalDecision = 'SUCCESS_SIGNAL_TIMEOUT';

        console.log('processingResult:', formContext.processingResult);
    }, 5000);
}

function handleMutations(mutationsList, observerInstance, formContext) {
    const formConfirmationId =
        'wpforms-confirmation-' +
        formContext.formId.split('-').at(-1).trim();

    const successElement = document.getElementById(formConfirmationId);

    if (!successElement) {
        return;
    }

    const successMessage = successElement.textContent?.trim();

    const successMessageIsVisible =
        typeof successMessage === 'string' &&
        successMessage !== '';

    const successEventData = {
        event: 'form_submit_success',
        form_id: formContext.formId,
        success_signal: 'confirmation_container',
        success_element_id: formConfirmationId,
        success_message_visible: successMessageIsVisible,
        trigger_source: formContext.triggerSource,
        page_type: formContext.pageType
    };

    const successEvent = {
        eventData: successEventData,
        validationResult: {
            valid: null,
            failedChecks: []
        },
        pushDecision: null
    };

    if (successEventData.event !== 'form_submit_success') {
        successEvent.validationResult.failedChecks.push('invalid_submit_success');
    }

    if (!isStringNonEmpty(successEventData.form_id)) {
        successEvent.validationResult.failedChecks.push('invalid_id');
    }

    if (successEventData.success_signal !== 'confirmation_container') {
        successEvent.validationResult.failedChecks.push('invalid_success_signal');
    }

    if (!isStringNonEmpty(successEventData.success_element_id)) {
        successEvent.validationResult.failedChecks.push('invalid_success_element_id');
    }

    if (successEventData.success_message_visible !== true) {
        successEvent.validationResult.failedChecks.push('success_message_missing');
    }

    if (successEventData.trigger_source !== 'submit_event') {
        successEvent.validationResult.failedChecks.push('invalid_trigger_source');
    }

    if (!isStringNonEmpty(successEventData.page_type)) {
        successEvent.validationResult.failedChecks.push('invalid_page_type');
    }

    if (successEvent.validationResult.failedChecks.length > 0) {
        successEvent.validationResult.valid = false;
        successEvent.pushDecision = 'SKIP';
    } else {
        successEvent.validationResult.valid = true;
        successEvent.pushDecision = 'PUSH';
    }

    formContext.processingResult.successEvent = successEvent;

    if (formContext.processingResult.successEvent.pushDecision === 'PUSH') {
        window.dataLayer.push(successEventData);
        formContext.processingResult.finalDecision = 'SUCCESS_PUSHED';

        console.log('successEvent:', formContext.processingResult.successEvent);
    }

    observerInstance.disconnect();
    activeFormObserver = null;

    if (activeFormObserverTimeoutId !== null) {
        clearTimeout(activeFormObserverTimeoutId);
        activeFormObserverTimeoutId = null;
    }

    console.log('processingResult:', formContext.processingResult);
}
