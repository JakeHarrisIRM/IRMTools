'use strict';

// ZPL uses ^ and ~ as command prefixes, so strip them out of free-text user
// input to avoid accidentally injecting ZPL commands / breaking the label.
function sanitizeZplText(text) {
  return String(text).replace(/[\^~]/g, '');
}

// Using an ^FO x-offset instead of a fixed ^FB block width, so longer text
// just starts further along the label instead of being wrapped/overlapped
// inside a box that's too narrow for it.
const ALIGN_TO_FO_X = {
  left: 20,
  center: 250,
  right: 400,
};

function buildSingleLineZpl(text, qty, align) {
  const safe = sanitizeZplText(text);
  const x = ALIGN_TO_FO_X[align] ?? ALIGN_TO_FO_X.left;
  return `^XA^FO${x},50^A0N,60,60^FD${safe}^FS^PQ${qty}^XZ`;
}

function buildMultiLineZpl(line1, line2, qty, align) {
  const safe1 = sanitizeZplText(line1);
  const safe2 = sanitizeZplText(line2);
  const x = ALIGN_TO_FO_X[align] ?? ALIGN_TO_FO_X.left;
  return ['^XA', `^FO${x},50^A0N,40,40^FD${safe1}^FS`, `^FO${x},100^A0N,40,40^FD${safe2}^FS`, `^PQ${qty}`, '^XZ'].join(
    '\n'
  );
}

// Multi-line variant for "Total Asset Count?": since each label needs its
// own distinct "A of B" text, this can't reuse a single ^PQ<qty> - instead
// it builds one full ^XA...^XZ label per unit (each with ^PQ1) and
// concatenates them into a single print job, printed back-to-back.
function buildMultiLineZplWithAssetCount(line1, line2Base, qty, align) {
  const safe1 = sanitizeZplText(line1);
  const safeLine2Base = sanitizeZplText(line2Base || '').trim();
  const x = ALIGN_TO_FO_X[align] ?? ALIGN_TO_FO_X.left;

  const labels = [];
  for (let i = 1; i <= qty; i++) {
    const countText = safeLine2Base ? `${safeLine2Base} - ${i} of ${qty}` : `${i} of ${qty}`;
    labels.push(
      ['^XA', `^FO${x},50^A0N,40,40^FD${safe1}^FS`, `^FO${x},100^A0N,40,40^FD${countText}^FS`, '^PQ1', '^XZ'].join(
        '\n'
      )
    );
  }
  return labels.join('\n');
}

// Failed Device Label: a fixed template (job/CID line + 5 checkbox fields
// for staff to mark up by hand) - only the quantity and the optional
// Job ID / CID text are dynamic here.
function buildFailedDeviceLabelZpl(qty, jobCid) {
  const safeJobCid = sanitizeZplText(jobCid || '').trim();
  return [
    '^XA',
    `^FO20,30^A0N,40,40^FDJob & CID: ${safeJobCid}^FS`,
    '^FO20,80^GB25,25,3^FS',
    '^FO55,80^A0N,30,30^FDFailed to Start^FS',
    '^FO370,80^GB25,25,3^FS',
    '^FO405,80^A0N,30,30^FDFailed to Wipe^FS',
    '^FO20,130^GB25,25,3^FS',
    '^FO55,130^A0N,30,30^FDNo Power^FS',
    '^FO210,130^GB25,25,3^FS',
    '^FO245,130^A0N,30,30^FDMDM Lock^FS',
    '^FO400,130^GB25,25,3^FS',
    '^FO435,130^A0N,30,30^FDBIOS Lock^FS',
    `^PQ${qty}`,
    '^XZ',
  ].join('\n');
}

// Missing Components Label: same idea as Failed Device Label - a fixed
// template (job/CID line + checkbox fields + a blank "Other:" write-in
// line) - only the quantity and the optional Job ID / CID text are
// dynamic here.
function buildMissingComponentsLabelZpl(qty, jobCid) {
  const safeJobCid = sanitizeZplText(jobCid || '').trim();
  return [
    '^XA',
    `^FO20,30^A0N,40,40^FDJob & CID: ${safeJobCid}^FS`,
    '^FO20,80^GB25,25,3^FS',
    '^FO55,80^A0N,30,30^FDMissing HDD^FS',
    '^FO260,80^GB25,25,3^FS',
    '^FO295,80^A0N,30,30^FDMissing RAM^FS',
    '^FO20,130^GB25,25,3^FS',
    '^FO55,130^A0N,30,30^FDOther: ^FS',
    '^FO140,157^GB315,2,2^FS',
    `^PQ${qty}`,
    '^XZ',
  ].join('\n');
}

// Removed Components Label: two distinct fixed templates that print as a
// bundle for every request - a 2:1 ratio, so quantity 5 prints 5 of each
// template (10 labels total). Template 1 is the removed-parts checklist;
// template 2 is a small "this HDD belongs to" tag. Both carry the same
// optional Job ID / CID text and quantity.
function buildRemovedComponentsLabelZpl(qty, jobCid) {
  const safeJobCid = sanitizeZplText(jobCid || '').trim();

  const label1 = [
    '^XA',
    `^FO20,30^A0N,25,25^FDJob & CID: ${safeJobCid}^FS`,
    '^FO20,60^GB20,20,3^FS',
    '^FO55,60^A0N,25,25^FDHDD Removed^FS',
    '^FO260,60^A0N,25,25^FDValue: ^FS',
    '^FO335,85^GB100,2,2^FS',
    '^FO20,100^A0N,25,25^FDS/N (HDD): ^FS',
    '^FO20,140^GB20,20,3^FS',
    '^FO55,140^A0N,25,25^FDRAM Removed^FS',
    '^FO260,140^A0N,25,25^FDValue: ^FS',
    '^FO335,165^GB100,2,2^FS',
    `^PQ${qty}`,
    '^XZ',
  ].join('\n');

  const label2 = [
    '^XA',
    '^FO20,30^A0N,40,40^FDThis HDD Belongs To S/N:^FS',
    '^FO30,125^GB400,2,2^FS',
    `^FO20,150^A0N,30,30^FDJob & CID: ${safeJobCid}^FS`,
    `^PQ${qty}`,
    '^XZ',
  ].join('\n');

  return [label1, label2].join('\n');
}

module.exports = {
  sanitizeZplText,
  ALIGN_TO_FO_X,
  buildSingleLineZpl,
  buildMultiLineZpl,
  buildMultiLineZplWithAssetCount,
  buildFailedDeviceLabelZpl,
  buildMissingComponentsLabelZpl,
  buildRemovedComponentsLabelZpl,
};
