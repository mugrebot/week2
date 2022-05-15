//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    uint256 leaves = 8; //leaves = n
    uint256 size = 15; // 2n-1 = 15

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        
        for (uint256 i=0; i < size; i++) {
            hashes.push(0);
        }
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        require(index < leaves, "you've reached the set number of leaves");
        //save the leaf to index position in hash
        hashes[index] = hashedLeaf;
        //increase index to receive another leaf hash
        index++;

        //next we need to calculate a different root, starting at index = n = 8
        //we can't just use leaves since we need to update its value and iterate through to make new hashes
        uint256 _leaves = leaves;

        for (uint256 i = 0; i < size -1; i += 2) {
        uint256 posiHash = PoseidonT3.poseidon([hashes[i], hashes[i + 1]]);
        hashes[_leaves] = posiHash;
        _leaves++;
        }

        root = hashes[size - 1]; //game time :D
        return root;


    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root

        if (!Verifier.verifyProof(a, b, c, input)) {
            return false;
        }

        uint256 _proof = input[0];

        if (_proof != root) {
            return false;
        }

        else

        return true;
    }
}
