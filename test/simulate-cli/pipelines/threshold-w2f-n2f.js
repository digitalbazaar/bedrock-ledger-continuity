/*
 * Copyright (c) 2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const gossipStrategy = require('../gossip-strategies/previous-peer');
const mergeStrategy =
  require('../merge-strategies/threshold-merge');

// NOTE: no spaces allowed, must be safe for prometheus metrics
module.exports.name = 'threshold-w2f-n2f';
module.exports.pipeline = async function() {
  const count = 1;

  for(let i = 0; i < count; i++) {
    await this.run({type: 'gossip', fn: gossipStrategy.run});
  }
  const mergeArgs = {witnessThreshold: '2f', peerThreshold: '2f'};
  await this.run({type: 'merge', fn: mergeStrategy.run, args: mergeArgs});
  const consensusResults = await this.run({type: 'consensus'});
  if(consensusResults.consensus) {
    console.log(`Found Consensus - Node ${this.nodeId}`);
  }
};