(function initializeOfficerLaneOptimizationService(globalScope) {
  const PRIMARY_TARGET_PERCENT = 20;
  const ADVISORY_TARGET_PERCENT = 25;
  const DEFAULT_MAX_EVALUATIONS = 220;
  const DEFAULT_EXACT_ENUMERATION_CAP = 20000;

  function sortLoansDeterministically(loans = []) {
    return [...loans].sort((loanA, loanB) => {
      const typeCompare = String(loanA.type || '').localeCompare(String(loanB.type || ''));
      if (typeCompare !== 0) {
        return typeCompare;
      }
      const amountCompare = (Number(loanB.amountRequested) || 0) - (Number(loanA.amountRequested) || 0);
      if (amountCompare !== 0) {
        return amountCompare;
      }
      return String(loanA.name || '').localeCompare(String(loanB.name || ''));
    });
  }

  function cloneAssignmentMap(baseAssignmentMap = new Map()) {
    return new Map(baseAssignmentMap);
  }

  function estimateAssignmentSearchSpace(loans = [], eligibleOfficersByLoan = new Map(), cap = DEFAULT_EXACT_ENUMERATION_CAP) {
    let total = 1;
    for (let index = 0; index < loans.length; index += 1) {
      const loan = loans[index];
      const eligible = eligibleOfficersByLoan.get(loan) || [];
      if (!eligible.length) {
        return 0;
      }
      total *= eligible.length;
      if (!Number.isFinite(total) || total > cap) {
        return null;
      }
    }
    return total;
  }

  function getTargetVariancePercent(fairnessEvaluation = {}, getVariancePercent) {
    if (typeof getVariancePercent === 'function') {
      const targetVariancePercent = Number(getVariancePercent(fairnessEvaluation));
      return Number.isFinite(targetVariancePercent) ? targetVariancePercent : Number.POSITIVE_INFINITY;
    }

    const defaultVariancePercent = Number(fairnessEvaluation?.metrics?.consumerVariance?.maxAmountVariancePercent);
    return Number.isFinite(defaultVariancePercent) ? defaultVariancePercent : Number.POSITIVE_INFINITY;
  }

  function scoreFairness(fairnessEvaluation = {}) {
    return Number(fairnessEvaluation?.metrics?.maxAmountVariancePercent) || 0;
  }

  function serializeAssignmentMap(assignmentMap = new Map(), orderedLoans = []) {
    return orderedLoans.map((loan) => `${String(loan?.name || '')}:${String(assignmentMap.get(loan) || '')}`).join('|');
  }

  function getTierRank(variancePercent, primaryTargetPercent = PRIMARY_TARGET_PERCENT, advisoryTargetPercent = ADVISORY_TARGET_PERCENT) {
    if (variancePercent <= primaryTargetPercent) {
      return 0;
    }
    if (variancePercent <= advisoryTargetPercent) {
      return 1;
    }
    return 2;
  }

  function getTierLabel(variancePercent, primaryTargetPercent = PRIMARY_TARGET_PERCENT, advisoryTargetPercent = ADVISORY_TARGET_PERCENT) {
    if (variancePercent <= primaryTargetPercent) {
      return 'under_20';
    }
    if (variancePercent <= advisoryTargetPercent) {
      return 'under_25';
    }
    return 'best_available_over_25';
  }

  function buildSummaryMessage(
    variancePercent,
    optimized,
    targetLabel = 'consumer-dollar variance',
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT
  ) {
    if (!optimized) {
      return 'Initial assignment remained the selected result after bounded optimization review.';
    }

    if (variancePercent <= primaryTargetPercent) {
      return `Optimization reached the primary ${targetLabel} target band (<= ${primaryTargetPercent.toFixed(1)}%).`;
    }

    if (variancePercent <= advisoryTargetPercent) {
      return `Optimization reached the ${targetLabel} advisory band (> ${primaryTargetPercent.toFixed(1)}% and <= ${advisoryTargetPercent.toFixed(1)}%).`;
    }

    return 'This is the most optimized result achievable from the available loan distribution.';
  }

  function isBetterCandidate(
    candidate,
    currentBest,
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT
  ) {
    if (!currentBest) {
      return true;
    }

    const candidateTier = getTierRank(candidate.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent);
    const currentTier = getTierRank(currentBest.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent);
    if (candidateTier !== currentTier) {
      return candidateTier < currentTier;
    }

    if (candidate.targetVariancePercent !== currentBest.targetVariancePercent) {
      return candidate.targetVariancePercent < currentBest.targetVariancePercent;
    }

    return candidate.overallVariancePercent < currentBest.overallVariancePercent;
  }

  function optimizeConsumerLaneAssignments({
    initialLoanToOfficerMap,
    eligibleOfficersByLoan,
    evaluateCandidate,
    isConsumerLoan,
    shouldIncludeLoan = () => true,
    getVariancePercent,
    targetLabel = 'consumer-dollar variance',
    primaryTargetPercent = PRIMARY_TARGET_PERCENT,
    advisoryTargetPercent = ADVISORY_TARGET_PERCENT,
    frontierWidth = 1,
    seedLoanToOfficerMaps = [],
    isCandidateAllowed = null,
    exactEnumerationCap = DEFAULT_EXACT_ENUMERATION_CAP,
    maxEvaluations = DEFAULT_MAX_EVALUATIONS,
    forceOptimizationRun = false,
    enableBreadthSearchFallback = false
  } = {}) {
    if (!(initialLoanToOfficerMap instanceof Map) || typeof evaluateCandidate !== 'function') {
      return {
        improved: false,
        optimizationRan: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 0,
        initialVariancePercent: 0,
        finalVariancePercent: 0,
        tierReached: 'under_20',
        summaryMessage: ''
      };
    }

    const baselineFairness = evaluateCandidate(initialLoanToOfficerMap);
    const baselineVariance = getTargetVariancePercent(baselineFairness, getVariancePercent);
    const baselineCandidateAllowed = typeof isCandidateAllowed !== 'function'
      || isCandidateAllowed(baselineFairness);
    const optimizedLoans = sortLoansDeterministically(
      [...initialLoanToOfficerMap.keys()]
        .filter((loan) => isConsumerLoan?.(loan))
        .filter((loan) => shouldIncludeLoan(loan))
    );

    if ((!forceOptimizationRun && baselineVariance < primaryTargetPercent && baselineCandidateAllowed) || !optimizedLoans.length) {
      return {
        improved: false,
        optimizationRan: false,
        bestLoanToOfficerMap: initialLoanToOfficerMap,
        evaluations: 1,
        initialVariancePercent: baselineVariance,
        finalVariancePercent: baselineVariance,
        tierReached: getTierLabel(baselineVariance, primaryTargetPercent, advisoryTargetPercent),
        summaryMessage: '',
        bestFairnessEvaluation: baselineFairness
      };
    }

    let evaluations = 1;
    const baselineCandidate = {
      loanToOfficerMap: initialLoanToOfficerMap,
      fairnessEvaluation: baselineFairness,
      targetVariancePercent: baselineVariance,
      overallVariancePercent: scoreFairness(baselineFairness),
      candidateAllowed: baselineCandidateAllowed
    };
    let best = baselineCandidate.candidateAllowed ? baselineCandidate : null;

    const requestedMaxEvaluations = Math.max(1, Number(maxEvaluations) || DEFAULT_MAX_EVALUATIONS);
    let boundedMaxEvaluations = requestedMaxEvaluations;
    const boundedFrontierWidth = Math.max(1, Math.floor(Number(frontierWidth) || 1));
    const boundedExactEnumerationCap = Math.max(0, Math.floor(Number(exactEnumerationCap) || 0));
    const estimatedOneHopNeighborCount = optimizedLoans.reduce((sum, loan) => {
      const eligibleCount = (eligibleOfficersByLoan.get(loan) || []).length;
      return sum + Math.max(0, eligibleCount - 1);
    }, 0);
    let searchPhaseEvaluationCap = boundedMaxEvaluations;

    const compareCandidates = (candidateA, candidateB) => {
      if (candidateA === candidateB) {
        return 0;
      }
      if (candidateA?.candidateAllowed !== candidateB?.candidateAllowed) {
        return candidateA?.candidateAllowed ? -1 : 1;
      }
      if (isBetterCandidate(candidateA, candidateB, primaryTargetPercent, advisoryTargetPercent)) {
        return -1;
      }
      if (isBetterCandidate(candidateB, candidateA, primaryTargetPercent, advisoryTargetPercent)) {
        return 1;
      }
      return 0;
    };

    const rankedFrontier = [baselineCandidate];
    const seen = new Set([serializeAssignmentMap(initialLoanToOfficerMap, optimizedLoans)]);

    const insertIntoFrontier = (frontier, candidate) => {
      const candidateKey = serializeAssignmentMap(candidate.loanToOfficerMap, optimizedLoans);
      if (frontier.some((entry) => serializeAssignmentMap(entry.loanToOfficerMap, optimizedLoans) === candidateKey)) {
        return frontier;
      }
      const next = [...frontier, candidate].sort(compareCandidates);
      return next.slice(0, boundedFrontierWidth);
    };

    const tryCandidate = (candidateMap) => {
      if (evaluations >= boundedMaxEvaluations) {
        return null;
      }
      const candidateKey = serializeAssignmentMap(candidateMap, optimizedLoans);
      if (seen.has(candidateKey)) {
        return null;
      }
      seen.add(candidateKey);
      const fairnessEvaluation = evaluateCandidate(candidateMap);
      evaluations += 1;
      const candidateAllowed = typeof isCandidateAllowed !== 'function'
        || isCandidateAllowed(fairnessEvaluation);
      const candidate = {
        loanToOfficerMap: candidateMap,
        fairnessEvaluation,
        targetVariancePercent: getTargetVariancePercent(fairnessEvaluation, getVariancePercent),
        overallVariancePercent: scoreFairness(fairnessEvaluation),
        candidateAllowed
      };

      if (candidateAllowed && (!best || isBetterCandidate(candidate, best, primaryTargetPercent, advisoryTargetPercent))) {
        best = candidate;
      }
      return candidate;
    };

    const exactSearchSpaceSize = estimateAssignmentSearchSpace(optimizedLoans, eligibleOfficersByLoan, boundedExactEnumerationCap);
    if (exactSearchSpaceSize !== null && exactSearchSpaceSize > 0 && exactSearchSpaceSize <= boundedExactEnumerationCap) {
      boundedMaxEvaluations = Math.max(requestedMaxEvaluations, exactSearchSpaceSize);
      const assignmentMap = cloneAssignmentMap(initialLoanToOfficerMap);
      const walkExact = (loanIndex) => {
        if (evaluations >= boundedMaxEvaluations || (best && best.targetVariancePercent <= primaryTargetPercent)) {
          return;
        }
        if (loanIndex >= optimizedLoans.length) {
          tryCandidate(cloneAssignmentMap(assignmentMap));
          return;
        }

        const loan = optimizedLoans[loanIndex];
        const eligible = [...(eligibleOfficersByLoan.get(loan) || [])]
          .map((officer) => String(officer || '').trim())
          .filter(Boolean)
          .sort((officerA, officerB) => officerA.localeCompare(officerB));

        for (let eligibleIndex = 0; eligibleIndex < eligible.length; eligibleIndex += 1) {
          assignmentMap.set(loan, eligible[eligibleIndex]);
          walkExact(loanIndex + 1);
          if (evaluations >= boundedMaxEvaluations || (best && best.targetVariancePercent <= primaryTargetPercent)) {
            return;
          }
        }
      };

      walkExact(0);

      const selectedCandidate = best || baselineCandidate;
      const improved = selectedCandidate.loanToOfficerMap !== initialLoanToOfficerMap;
      return {
        improved,
        optimizationRan: true,
        bestLoanToOfficerMap: selectedCandidate.loanToOfficerMap,
        evaluations,
        initialVariancePercent: baselineVariance,
        finalVariancePercent: selectedCandidate.targetVariancePercent,
        tierReached: getTierLabel(selectedCandidate.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent),
        summaryMessage: buildSummaryMessage(
          selectedCandidate.targetVariancePercent,
          improved,
          targetLabel,
          primaryTargetPercent,
          advisoryTargetPercent
        ),
        bestFairnessEvaluation: selectedCandidate.fairnessEvaluation
      };
    }

    const refinementEvaluationReserve = Math.min(
      estimatedOneHopNeighborCount,
      Math.max(20, Math.floor(boundedMaxEvaluations * 0.66))
    );
    const breadthFallbackEvaluationReserve = enableBreadthSearchFallback
      ? Math.min(
        Math.max(120, estimatedOneHopNeighborCount * 4),
        Math.max(120, Math.floor(boundedMaxEvaluations * 0.45))
      )
      : 0;
    searchPhaseEvaluationCap = Math.max(
      1,
      boundedMaxEvaluations - refinementEvaluationReserve - breadthFallbackEvaluationReserve
    );

    const initialSeedMaps = Array.isArray(seedLoanToOfficerMaps) ? seedLoanToOfficerMaps : [];
    initialSeedMaps.forEach((seedMap) => {
      if (!(seedMap instanceof Map)) {
        return;
      }
      if (evaluations >= searchPhaseEvaluationCap) {
        return;
      }
      const candidate = tryCandidate(cloneAssignmentMap(seedMap));
      if (candidate) {
        rankedFrontier.push(candidate);
      }
    });

    rankedFrontier.sort(compareCandidates);
    let frontier = rankedFrontier.slice(0, boundedFrontierWidth);
    const baselineKey = serializeAssignmentMap(baselineCandidate.loanToOfficerMap, optimizedLoans);
    if (!frontier.some((entry) => serializeAssignmentMap(entry.loanToOfficerMap, optimizedLoans) === baselineKey)) {
      frontier = [baselineCandidate, ...frontier];
    }
    while (frontier.length && evaluations < searchPhaseEvaluationCap && (!best || best.targetVariancePercent > primaryTargetPercent)) {
      let nextFrontier = [];

      for (let frontierIndex = 0; frontierIndex < frontier.length && evaluations < searchPhaseEvaluationCap; frontierIndex += 1) {
        const frontierCandidate = frontier[frontierIndex];

        for (let loanIndex = 0; loanIndex < optimizedLoans.length && evaluations < searchPhaseEvaluationCap; loanIndex += 1) {
          const loan = optimizedLoans[loanIndex];
          const currentOfficer = frontierCandidate.loanToOfficerMap.get(loan);
          const eligibleOfficers = [...(eligibleOfficersByLoan.get(loan) || [])]
            .map((officer) => String(officer || '').trim())
            .filter(Boolean)
            .sort((officerA, officerB) => officerA.localeCompare(officerB));

          eligibleOfficers.forEach((candidateOfficer) => {
            if (evaluations >= searchPhaseEvaluationCap || candidateOfficer === currentOfficer) {
              return;
            }

            const candidateMap = cloneAssignmentMap(frontierCandidate.loanToOfficerMap);
            candidateMap.set(loan, candidateOfficer);
            const candidate = tryCandidate(candidateMap);
            if (candidate) {
              nextFrontier = insertIntoFrontier(nextFrontier, candidate);
            }
          });

          for (let otherIndex = loanIndex + 1; otherIndex < optimizedLoans.length && evaluations < searchPhaseEvaluationCap; otherIndex += 1) {
            // 2) Pairwise swaps for loans currently held by different officers.
            const otherLoan = optimizedLoans[otherIndex];
            const officerA = frontierCandidate.loanToOfficerMap.get(loan);
            const officerB = frontierCandidate.loanToOfficerMap.get(otherLoan);
            if (!officerA || !officerB || officerA === officerB) {
              continue;
            }

            const loanEligible = eligibleOfficersByLoan.get(loan) || [];
            const otherEligible = eligibleOfficersByLoan.get(otherLoan) || [];
            if (!loanEligible.includes(officerB) || !otherEligible.includes(officerA)) {
              continue;
            }

            const candidateMap = cloneAssignmentMap(frontierCandidate.loanToOfficerMap);
            candidateMap.set(loan, officerB);
            candidateMap.set(otherLoan, officerA);
            const candidate = tryCandidate(candidateMap);
            if (candidate) {
              nextFrontier = insertIntoFrontier(nextFrontier, candidate);
            }
          }

          if (best && best.targetVariancePercent <= primaryTargetPercent) {
            break;
          }
        }
      }

      frontier = nextFrontier;
    }

    // Final local refinement: fully scan one-hop neighbors from the selected best candidate
    // so obvious last-step improvements are not lost to frontier pruning.
    let refined = true;
    while (refined && evaluations < boundedMaxEvaluations && (!best || best.targetVariancePercent > primaryTargetPercent)) {
      refined = false;
      const currentBest = best || baselineCandidate;
      const helperLoansByAscendingAmount = [...optimizedLoans].sort((loanA, loanB) => {
        const amountCompare = (Number(loanA?.amountRequested) || 0) - (Number(loanB?.amountRequested) || 0);
        if (amountCompare !== 0) {
          return amountCompare;
        }
        return String(loanA?.name || '').localeCompare(String(loanB?.name || ''));
      });

      for (let loanIndex = 0; loanIndex < optimizedLoans.length && evaluations < boundedMaxEvaluations; loanIndex += 1) {
        const loan = optimizedLoans[loanIndex];
        const currentOfficer = currentBest.loanToOfficerMap.get(loan);
        const eligibleOfficers = [...(eligibleOfficersByLoan.get(loan) || [])]
          .map((officer) => String(officer || '').trim())
          .filter(Boolean)
          .sort((officerA, officerB) => officerA.localeCompare(officerB));

        for (let eligibleIndex = 0; eligibleIndex < eligibleOfficers.length && evaluations < boundedMaxEvaluations; eligibleIndex += 1) {
          const candidateOfficer = eligibleOfficers[eligibleIndex];
          if (candidateOfficer === currentOfficer) {
            continue;
          }

          const candidateMap = cloneAssignmentMap(currentBest.loanToOfficerMap);
          candidateMap.set(loan, candidateOfficer);
          const previousBest = best;
          const candidate = tryCandidate(candidateMap);
          if (best !== previousBest) {
            refined = true;
            break;
          }

          if (
            candidate
            && candidate.candidateAllowed === false
            && candidate.targetVariancePercent < currentBest.targetVariancePercent
            && evaluations < boundedMaxEvaluations
          ) {
            const helperLoans = helperLoansByAscendingAmount
              .filter((helperLoan) => helperLoan !== loan)
              .slice(0, 6);

            for (let helperIndex = 0; helperIndex < helperLoans.length && evaluations < boundedMaxEvaluations; helperIndex += 1) {
              const helperLoan = helperLoans[helperIndex];
              const helperCurrentOfficer = candidate.loanToOfficerMap.get(helperLoan);
              const helperEligibleOfficers = [...(eligibleOfficersByLoan.get(helperLoan) || [])]
                .map((officer) => String(officer || '').trim())
                .filter(Boolean)
                .sort((officerA, officerB) => officerA.localeCompare(officerB));

              for (let helperOfficerIndex = 0; helperOfficerIndex < helperEligibleOfficers.length && evaluations < boundedMaxEvaluations; helperOfficerIndex += 1) {
                const helperOfficer = helperEligibleOfficers[helperOfficerIndex];
                if (helperOfficer === helperCurrentOfficer) {
                  continue;
                }

                const helperMap = cloneAssignmentMap(candidate.loanToOfficerMap);
                helperMap.set(helperLoan, helperOfficer);
                const helperPreviousBest = best;
                tryCandidate(helperMap);
                if (best !== helperPreviousBest) {
                  refined = true;
                  break;
                }
              }

              if (refined) {
                break;
              }
            }

            if (refined) {
              break;
            }
          }
        }

        if (refined || (best && best.targetVariancePercent <= primaryTargetPercent)) {
          break;
        }
      }
    }

    if (enableBreadthSearchFallback && evaluations < boundedMaxEvaluations && (!best || best.targetVariancePercent > primaryTargetPercent)) {
      const fallbackQueue = [];
      const fallbackQueued = new Set();
      const enqueueFallback = (candidateMap) => {
        const candidateKey = serializeAssignmentMap(candidateMap, optimizedLoans);
        if (fallbackQueued.has(candidateKey)) {
          return;
        }
        fallbackQueued.add(candidateKey);
        fallbackQueue.push(cloneAssignmentMap(candidateMap));
      };

      enqueueFallback(baselineCandidate.loanToOfficerMap);
      enqueueFallback((best || baselineCandidate).loanToOfficerMap);
      initialSeedMaps.forEach((seedMap) => {
        if (seedMap instanceof Map) {
          enqueueFallback(seedMap);
        }
      });

      while (fallbackQueue.length && evaluations < boundedMaxEvaluations && (!best || best.targetVariancePercent > primaryTargetPercent)) {
        const currentMap = fallbackQueue.shift();

        for (let loanIndex = 0; loanIndex < optimizedLoans.length && evaluations < boundedMaxEvaluations; loanIndex += 1) {
          const loan = optimizedLoans[loanIndex];
          const currentOfficer = currentMap.get(loan);
          const eligibleOfficers = [...(eligibleOfficersByLoan.get(loan) || [])]
            .map((officer) => String(officer || '').trim())
            .filter(Boolean)
            .sort((officerA, officerB) => officerA.localeCompare(officerB));

          for (let eligibleIndex = 0; eligibleIndex < eligibleOfficers.length && evaluations < boundedMaxEvaluations; eligibleIndex += 1) {
            const candidateOfficer = eligibleOfficers[eligibleIndex];
            if (candidateOfficer === currentOfficer) {
              continue;
            }

            const candidateMap = cloneAssignmentMap(currentMap);
            candidateMap.set(loan, candidateOfficer);
            const candidate = tryCandidate(candidateMap);
            if (candidate && candidate.candidateAllowed !== false) {
              enqueueFallback(candidateMap);
            }

            if (best && best.targetVariancePercent <= primaryTargetPercent) {
              break;
            }
          }

          if (best && best.targetVariancePercent <= primaryTargetPercent) {
            break;
          }
        }
      }
    }

    const selectedCandidate = best || baselineCandidate;
    const improved = selectedCandidate.loanToOfficerMap !== initialLoanToOfficerMap;
    return {
      improved,
      optimizationRan: true,
      bestLoanToOfficerMap: selectedCandidate.loanToOfficerMap,
      evaluations,
      initialVariancePercent: baselineVariance,
      finalVariancePercent: selectedCandidate.targetVariancePercent,
      tierReached: getTierLabel(selectedCandidate.targetVariancePercent, primaryTargetPercent, advisoryTargetPercent),
      summaryMessage: buildSummaryMessage(
        selectedCandidate.targetVariancePercent,
        improved,
        targetLabel,
        primaryTargetPercent,
        advisoryTargetPercent
      ),
      bestFairnessEvaluation: selectedCandidate.fairnessEvaluation
    };
  }

  const service = {
    PRIMARY_TARGET_PERCENT,
    ADVISORY_TARGET_PERCENT,
    optimizeConsumerLaneAssignments
  };

  globalScope.OfficerLaneOptimizationService = service;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = service;
  }
})(typeof window !== 'undefined' ? window : globalThis);
