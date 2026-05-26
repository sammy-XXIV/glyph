import { BigInt } from "@graphprotocol/graph-ts";
import {
  Minted,
  Upgraded,
  Predicted,
  PickScored,
  PrizeClaimed,
} from "../generated/Glyph/Glyph";
import { Player, Match, Prediction, PrizeClaim } from "../generated/schema";

function getOrCreatePlayer(address: string): Player {
  let player = Player.load(address);
  if (!player) {
    player = new Player(address);
    player.tokenId = BigInt.fromI32(0);
    player.tier = 0;
    player.cardIndex = 0;
    player.correctPicks = 0;
    player.totalPicks = 0;
  }
  return player;
}

function getOrCreateMatch(matchId: BigInt): Match {
  let match = Match.load(matchId.toString());
  if (!match) {
    match = new Match(matchId.toString());
  }
  return match;
}

export function handleMinted(event: Minted): void {
  let player = getOrCreatePlayer(event.params.player.toHexString());
  player.tokenId = event.params.tokenId;
  player.tier = event.params.tier;
  player.cardIndex = event.params.cardIndex;
  player.save();
}

export function handleUpgraded(event: Upgraded): void {
  let player = getOrCreatePlayer(event.params.player.toHexString());
  player.tokenId = event.params.newId;
  player.tier = event.params.newTier;
  player.save();
}

export function handlePredicted(event: Predicted): void {
  let matchId = event.params.matchId;
  let playerId = event.params.player.toHexString();
  let id = playerId + "-" + matchId.toString();

  let match = getOrCreateMatch(matchId);
  match.save();

  let player = getOrCreatePlayer(playerId);
  player.save();

  let prediction = Prediction.load(id);
  if (!prediction) {
    prediction = new Prediction(id);
    prediction.player = playerId;
    prediction.match = matchId.toString();
    prediction.matchId = matchId;
    prediction.submittedAt = event.block.timestamp;
  }
  prediction.pick = event.params.pick;
  prediction.save();
}

export function handlePickScored(event: PickScored): void {
  let id = event.params.player.toHexString() + "-" + event.params.matchId.toString();
  let prediction = Prediction.load(id);
  if (!prediction) return;

  prediction.isCorrect = event.params.correct;
  prediction.save();

  let player = getOrCreatePlayer(event.params.player.toHexString());
  player.totalPicks = player.totalPicks + 1;
  if (event.params.correct) player.correctPicks = player.correctPicks + 1;
  player.save();
}

export function handlePrizeClaimed(event: PrizeClaimed): void {
  let id = event.transaction.hash.toHexString();
  let claim = new PrizeClaim(id);
  claim.player = event.params.player.toHexString();
  claim.amount = event.params.amount;
  claim.timestamp = event.block.timestamp;
  claim.save();
}
