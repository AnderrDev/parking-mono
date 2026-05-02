-- Test 05: trigger sync_dian_from_siigo deriva dian_status y espeja CUFE/PDF/XML
-- Spec: specs/database-schema-siigo-delta.spec.md §"Trigger derivación"

\set ON_ERROR_STOP on
\echo '=== TEST 05: trigger sync_dian_from_siigo ==='

BEGIN;

-- Setup: cliente y factura base
DO $setup$
DECLARE
  c_uid UUID;
BEGIN
  INSERT INTO customers (doc_type, doc_number, name, email)
  VALUES ('cedula', 'TEST_SIIGO_TRG', 'Cliente trigger', 'trg@test.local')
  RETURNING id INTO c_uid;

  -- Factura inicial (siigo_status default = 'pending')
  INSERT INTO invoices (internal_number, tipo_documento, customer_id, total_cents, requested_invoice)
  VALUES ('FAC-TEST-TRG-0001', '01', c_uid, 119000, TRUE);
END
$setup$;

\echo '--- subtest 5.1: pending → dian_status=pending ---'
DO $t51$
DECLARE
  ds TEXT;
BEGIN
  SELECT dian_status INTO ds FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds <> 'pending' THEN
    RAISE EXCEPTION 'FAIL: esperaba dian_status=pending, obtuve %', ds;
  END IF;
  RAISE NOTICE 'PASS: pending → dian_status=pending';
END
$t51$;

\echo '--- subtest 5.2: Stamped + cufe → dian_status=accepted, espejos llenos ---'
DO $t52$
DECLARE
  ds TEXT;
  d_cufe TEXT;
  d_pdf TEXT;
  d_xml TEXT;
  legacy_cufe TEXT;
BEGIN
  UPDATE invoices
  SET siigo_status   = 'Stamped',
      siigo_cufe     = 'CUFE-ABC-123',
      siigo_pdf_url  = 'https://siigo.com/pdf/abc.pdf',
      siigo_xml_url  = 'https://siigo.com/xml/abc.xml'
  WHERE internal_number = 'FAC-TEST-TRG-0001';

  SELECT dian_status, dian_cufe, dian_pdf_url, dian_xml_url, cufe
  INTO ds, d_cufe, d_pdf, d_xml, legacy_cufe
  FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds <> 'accepted'                                   THEN RAISE EXCEPTION 'FAIL: dian_status=%, esperaba accepted', ds; END IF;
  IF d_cufe <> 'CUFE-ABC-123'                           THEN RAISE EXCEPTION 'FAIL: dian_cufe=%, esperaba CUFE-ABC-123', d_cufe; END IF;
  IF legacy_cufe <> 'CUFE-ABC-123'                      THEN RAISE EXCEPTION 'FAIL: cufe=%, esperaba CUFE-ABC-123', legacy_cufe; END IF;
  IF d_pdf <> 'https://siigo.com/pdf/abc.pdf'           THEN RAISE EXCEPTION 'FAIL: dian_pdf_url=%', d_pdf; END IF;
  IF d_xml <> 'https://siigo.com/xml/abc.xml'           THEN RAISE EXCEPTION 'FAIL: dian_xml_url=%', d_xml; END IF;
  RAISE NOTICE 'PASS: Stamped → accepted + cufe/pdf/xml espejados';
END
$t52$;

\echo '--- subtest 5.3: Rejected → dian_status=rejected ---'
DO $t53$
DECLARE
  ds TEXT;
BEGIN
  UPDATE invoices SET siigo_status = 'Rejected', siigo_last_error = 'doc duplicado'
  WHERE internal_number = 'FAC-TEST-TRG-0001';

  SELECT dian_status INTO ds FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: dian_status=%, esperaba rejected', ds;
  END IF;
  RAISE NOTICE 'PASS: Rejected → rejected';
END
$t53$;

\echo '--- subtest 5.4: queued_offline → dian_status=contingency ---'
DO $t54$
DECLARE
  ds TEXT;
BEGIN
  UPDATE invoices SET siigo_status = 'queued_offline'
  WHERE internal_number = 'FAC-TEST-TRG-0001';

  SELECT dian_status INTO ds FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds <> 'contingency' THEN
    RAISE EXCEPTION 'FAIL: dian_status=%, esperaba contingency', ds;
  END IF;
  RAISE NOTICE 'PASS: queued_offline → contingency';
END
$t54$;

\echo '--- subtest 5.5: error_max_retries → dian_status=contingency ---'
DO $t55$
DECLARE
  ds TEXT;
BEGIN
  UPDATE invoices SET siigo_status = 'error_max_retries'
  WHERE internal_number = 'FAC-TEST-TRG-0001';

  SELECT dian_status INTO ds FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds <> 'contingency' THEN
    RAISE EXCEPTION 'FAIL: dian_status=%, esperaba contingency', ds;
  END IF;
  RAISE NOTICE 'PASS: error_max_retries → contingency';
END
$t55$;

\echo '--- subtest 5.6: InProcess y Sent → dian_status=sent ---'
DO $t56$
DECLARE
  ds_in TEXT;
  ds_sent TEXT;
BEGIN
  UPDATE invoices SET siigo_status = 'InProcess'
  WHERE internal_number = 'FAC-TEST-TRG-0001';
  SELECT dian_status INTO ds_in FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  UPDATE invoices SET siigo_status = 'Sent'
  WHERE internal_number = 'FAC-TEST-TRG-0001';
  SELECT dian_status INTO ds_sent FROM invoices WHERE internal_number = 'FAC-TEST-TRG-0001';

  IF ds_in <> 'sent'   THEN RAISE EXCEPTION 'FAIL: InProcess → %, esperaba sent', ds_in; END IF;
  IF ds_sent <> 'sent' THEN RAISE EXCEPTION 'FAIL: Sent → %, esperaba sent', ds_sent; END IF;
  RAISE NOTICE 'PASS: InProcess y Sent → sent';
END
$t56$;

ROLLBACK;
\echo '=== TEST 05 OK ==='
