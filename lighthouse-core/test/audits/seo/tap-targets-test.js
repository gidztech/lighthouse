/**
 * @license Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */

const TapTargetsAudit = require('../../../audits/seo/tap-targets.js');
const assert = require('assert');

function auditTapTargets(tapTargets) {
  const artifacts = {
    TapTargets: tapTargets,
    Viewport: 'width=device-width',
  };

  return TapTargetsAudit.audit(artifacts);
}

const tapTargetSize = 10;
const minimalOverlapCausingDistance = (TapTargetsAudit.FINGER_SIZE_PX - tapTargetSize) / 2;
// 3px means it'll have 10x3=30px overlap with the finger, which is 30% of the tap targets own score
// and the failure cutoff is 25%
const pxOverlappedByFinger = 3;
const minimalFailingOverlapDistance = minimalOverlapCausingDistance + pxOverlappedByFinger;

function getBorderlineTapTargets(options = {}) {
  function makeClientRects({x, y}) {
    return {
      left: x,
      top: y,
      width: tapTargetSize,
      height: tapTargetSize,
      bottom: y + tapTargetSize,
      right: x + tapTargetSize,
    };
  }

  const mainTapTarget = {
    snippet: '<main></main>',
    clientRects: [
      makeClientRects({
        x: 0,
        y: 0,
      }),
    ],
  };
  const tapTargetBelow = {
    snippet: '<below></below>',
    clientRects: [
      makeClientRects({
        x: 0,
        y: mainTapTarget.clientRects[0].top + TapTargetsAudit.FINGER_SIZE_PX,
      }),
    ],
  };
  const tapTargetToTheRight = {
    snippet: '<right></right>',
    clientRects: [
      makeClientRects({
        x: mainTapTarget.clientRects[0].left + TapTargetsAudit.FINGER_SIZE_PX,
        y: 0,
      }),
    ],
  };

  const targets = [mainTapTarget, tapTargetBelow, tapTargetToTheRight];

  const overlapAmount = minimalFailingOverlapDistance;
  if (options.failRight) {
    tapTargetToTheRight.clientRects[0].left -= overlapAmount;
    tapTargetToTheRight.clientRects[0].right -= overlapAmount;
  }
  if (options.failBelow) {
    tapTargetBelow.clientRects[0].top -= overlapAmount;
    tapTargetBelow.clientRects[0].bottom -= overlapAmount;
  }
  if (options.addFullyContainedTapTarget) {
    targets.push({
      snippet: '<contained></contained>',
      clientRects: [
        makeClientRects({
          x: 0,
          y: 0,
        }),
      ],
    });
  }
  if (options.failSecondClientRect) {
    mainTapTarget.clientRects.push(
      makeClientRects({
        x: 0,
        y: overlapAmount,
      })
    );
  }

  return targets;
}

describe('SEO: Tap targets audit', () => {
  it('passes when there are no tap targets', () => {
    const auditResult = auditTapTargets([]);
    assert.equal(auditResult.rawValue, true);
    assert.equal(auditResult.score, 1);
  });

  it('passes when tap targets don\'t overlap', () => {
    const auditResult = auditTapTargets(getBorderlineTapTargets());
    assert.equal(auditResult.rawValue, true);
  });

  it('passes when a target is fully contained in an overlapping target', () => {
    const auditResult = auditTapTargets(getBorderlineTapTargets({
      addFullyContainedTapTarget: true,
    }));
    assert.equal(auditResult.rawValue, true);
  });

  it('fails if two tap targets overlaps each other horizontally', () => {
    const auditResult = auditTapTargets(
      getBorderlineTapTargets({
        failRight: true,
      })
    );
    assert.equal(auditResult.rawValue, false);
    assert.equal(Math.round(auditResult.score * 100), 33);
    const failure = auditResult.details.items[0];
    assert.equal(failure.tapTarget.snippet, '<main></main>');
    assert.equal(failure.overlappingTarget.snippet, '<right></right>');
    assert.equal(failure.size, '10x10');
    // Includes data for debugging/adjusting the scoring logic later on
    assert.equal(failure.tapTargetScore, tapTargetSize * tapTargetSize);
    assert.equal(failure.overlappingTargetScore, tapTargetSize * pxOverlappedByFinger);
    assert.equal(failure.overlapScoreRatio, 0.3);
    assert.equal(failure.width, 10);
    assert.equal(failure.height, 10);
  });

  it('fails if a tap target overlaps vertically', () => {
    const auditResult = auditTapTargets(
      getBorderlineTapTargets({
        failBelow: true,
      })
    );
    assert.equal(auditResult.rawValue, false);
  });

  it('fails when one of the client rects overlaps', () => {
    const auditResult = auditTapTargets(
      getBorderlineTapTargets({
        failSecondClientRect: true,
      })
    );
    assert.equal(auditResult.rawValue, false);
  });

  it('reports 4 items if the main target is overlapped both vertically and horizontally', () => {
    // Main is overlapped by right + below, right and below are each overlapped by main
    const auditResult = auditTapTargets(
      getBorderlineTapTargets({
        failRight: true,
        failBelow: true,
      })
    );
    assert.equal(Math.round(auditResult.score * 100), 0); // all tap targets are overlapped by something
    const failures = auditResult.details.items;
    assert.equal(failures.length, 4);
  });
});