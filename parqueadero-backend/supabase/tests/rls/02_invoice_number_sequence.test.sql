-- Test 02: assign_invoice_number genera numbers únicos y secuenciales
-- Spec: specs/database-schema.spec.md §"Secuencias"

\set ON_ERROR_STOP on
\echo '=== TEST 02: invoice_number_seq ==='

BEGIN;

INSERT INTO customers (doc_type, doc_number, name)
VALUES ('cedula', 'TEST_INV_SEQ', 'Test Customer Seq');

-- 5 inserts seguidos
INSERT INTO invoices (tipo_documento, customer_id, total_cents)
SELECT '01',
       (SELECT id FROM customers WHERE doc_number = 'TEST_INV_SEQ'),
       i * 1000
FROM generate_series(1, 5) AS i;

DO $$
DECLARE
  numbers TEXT[];
  total INT;
  unique_cnt INT;
BEGIN
  SELECT array_agg(number ORDER BY number) INTO numbers
  FROM invoices
  WHERE customer_id = (SELECT id FROM customers WHERE doc_number = 'TEST_INV_SEQ');

  total := array_length(numbers, 1);
  SELECT count(DISTINCT n) INTO unique_cnt FROM unnest(numbers) AS n;

  IF total <> 5 THEN
    RAISE EXCEPTION 'FAIL: esperaba 5 invoices, obtuve %', total;
  END IF;

  IF unique_cnt <> 5 THEN
    RAISE EXCEPTION 'FAIL: numbers no son únicos: %', numbers;
  END IF;

  -- Validar formato FAC-YYYY-MM-DD-NNNN
  IF NOT (numbers[1] ~ '^FAC-\d{4}-\d{2}-\d{2}-\d{4}$') THEN
    RAISE EXCEPTION 'FAIL: formato inesperado: %', numbers[1];
  END IF;

  RAISE NOTICE 'PASS: 5 numbers únicos generados: %', numbers;
END
$$;

ROLLBACK;
\echo '=== TEST 02 OK ==='
