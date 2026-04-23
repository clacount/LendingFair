const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMortgageParticipationBias,
  getMortgageCompetitionStrength,
  selectMortgageCompetitionPool
} = require('../src/services/mortgageFocusRoutingService.js');

test('HELOC keeps mortgage-only advantage without hard-locking flex participation', () => {
  const mortgageOnlyStrength = getMortgageCompetitionStrength({
    rawWeight: 1,
    mortgagePermissionLevel: 'heloc',
    hasMortgageOnlyOfficer: true,
    isMortgageOnly: true,
    isFlex: false
  });

  const flexStrength = getMortgageCompetitionStrength({
    rawWeight: 0.3,
    mortgagePermissionLevel: 'heloc',
    hasMortgageOnlyOfficer: true,
    isMortgageOnly: false,
    isFlex: true
  });

  assert.ok(mortgageOnlyStrength > flexStrength, 'Mortgage-only should remain strongest individual HELOC candidate');
  assert.ok(flexStrength > 0.7, 'Consumer-focused flex should still retain meaningful HELOC competitiveness');

  const fullMortgageFlexBias = getMortgageParticipationBias({
    mortgagePermissionLevel: 'full-mortgage',
    hasMortgageOnlyOfficer: true,
    isFlex: true
  });
  const helocFlexBias = getMortgageParticipationBias({
    mortgagePermissionLevel: 'heloc',
    hasMortgageOnlyOfficer: true,
    isFlex: true
  });

  assert.ok(helocFlexBias > fullMortgageFlexBias, 'HELOC flex bias should be less suppressive than full-mortgage bias');
});


test('full-mortgage pool includes override-enabled flex officers alongside mortgage-only', () => {
  const officers = [
    { name: 'M1', eligibility: { consumer: false, mortgage: true }, mortgageOverride: false },
    { name: 'F1', eligibility: { consumer: true, mortgage: true }, mortgageOverride: true },
    { name: 'F2', eligibility: { consumer: true, mortgage: true }, mortgageOverride: false }
  ];

  const fullMortgagePool = selectMortgageCompetitionPool(officers, 'full-mortgage').map((officer) => officer.name);
  assert.deepEqual(fullMortgagePool, ['M1', 'F1']);

  const helocPool = selectMortgageCompetitionPool(officers, 'heloc').map((officer) => officer.name);
  assert.deepEqual(helocPool, ['M1', 'F1', 'F2']);
});


test('8-HELOC weighted apportionment yields flex participation with M as top share', () => {
  const officers = [
    { name: 'K', rawWeight: 1, isMortgageOnly: true, isFlex: false },
    { name: 'P', rawWeight: 0.3, isMortgageOnly: false, isFlex: true },
    { name: 'A', rawWeight: 0.3, isMortgageOnly: false, isFlex: true },
    { name: 'J', rawWeight: 0.3, isMortgageOnly: false, isFlex: true }
  ];

  const strengths = officers.map((officer) => ({
    ...officer,
    strength: getMortgageCompetitionStrength({
      rawWeight: officer.rawWeight,
      mortgagePermissionLevel: 'heloc',
      hasMortgageOnlyOfficer: true,
      isMortgageOnly: officer.isMortgageOnly,
      isFlex: officer.isFlex
    })
  }));

  const totalStrength = strengths.reduce((sum, officer) => sum + officer.strength, 0);
  const quotaPlan = strengths.map((officer) => {
    const rawQuota = (officer.strength / totalStrength) * 8;
    return {
      name: officer.name,
      floor: Math.floor(rawQuota),
      remainder: rawQuota - Math.floor(rawQuota)
    };
  });

  let allocated = quotaPlan.reduce((sum, officer) => sum + officer.floor, 0);
  quotaPlan.sort((a, b) => b.remainder - a.remainder);
  for (let index = 0; index < quotaPlan.length && allocated < 8; index += 1) {
    quotaPlan[index].floor += 1;
    allocated += 1;
  }

  const assigned = Object.fromEntries(quotaPlan.map((officer) => [officer.name, officer.floor]));

  assert.ok(assigned.K < 8, 'M officer should not be hard-locked to all HELOC assignments.');
  assert.ok((assigned.P + assigned.A + assigned.J) > 0, 'Flex officers should receive some HELOC participation.');
  assert.ok(assigned.K >= assigned.P && assigned.K >= assigned.A && assigned.K >= assigned.J, 'M officer should retain the largest individual share.');
});
