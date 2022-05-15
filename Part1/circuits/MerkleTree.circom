pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n levels 
    signal input leaves[2**n];
    signal input pathElements[n];
    signal input pathIndices;
    signal output root;
    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    component switcher[n];
    component hasher[n];

    component indexBits = Num2Bits(n);
    indexBits.in <== pathIndices;

    for (var i = 0; i < n; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaves[2**n] : hasher[i - 1].out;
        switcher[i].R <== pathElements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== switcher[i].outL;
        hasher[i].inputs[1] <== switcher[i].outR;
    }

    root <== hasher[n - 1].out;

}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path

    component switcher[n];
    component hasher[n];

    component indexBits = Num2Bits(n);
    indexBits.in <== path_index[n-1];

        for (var i = 0; i < n; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaf : hasher[i - 1].out;
        switcher[i].R <== path_elements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== switcher[i].outL;
        hasher[i].inputs[1] <== switcher[i].outR;
    }

    root <== hasher[n - 1].out;



}