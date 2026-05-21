import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSaleEmail } from '../backend/email_reader.js';

describe('parseSaleEmail', () => {
  it('parses a valid email body', () => {
    const body = 'Unidade: BERRINI\nProduto: Carro\nValor: R$ 2.500,00\nData: 19/05/2026';
    const r = parseSaleEmail(body);
    assert.ok(r);
    assert.equal(r.unit,    'BERRINI');
    assert.equal(r.product, 'Carro');
    assert.equal(r.value,   2500);
    assert.equal(r.date,    '2026-05-19');
  });

  it('parses different unit and product', () => {
    const body = 'Unidade: CUBO\nProduto: Moto\nValor: R$ 1.200,00\nData: 19/05/2026';
    const r = parseSaleEmail(body);
    assert.equal(r.unit,  'CUBO');
    assert.equal(r.value, 1200);
  });

  it('returns null when fields are missing', () => {
    assert.equal(parseSaleEmail('Este email não tem campos de venda'), null);
  });

  it('returns null for unknown unit', () => {
    const body = 'Unidade: DESCONHECIDA\nProduto: Carro\nValor: R$ 1.000,00\nData: 19/05/2026';
    assert.equal(parseSaleEmail(body), null);
  });

  it('returns null for unknown product', () => {
    const body = 'Unidade: BERRINI\nProduto: Aviao\nValor: R$ 1.000,00\nData: 19/05/2026';
    assert.equal(parseSaleEmail(body), null);
  });
});
