const { tryParseSource } = require('./utils/astPatch/grammarLoader');
const { findNamedNode } = require('./utils/astPatch/nodeFinders');
const { computePatch } = require('./utils/astPatch/computePatch');
const fs = require('fs');

async function main() {
    // restore original content first
    const original = `<?php

namespace App\\Utils;

class RefactorTest
{
    public function calculateTotal(array $items): float
    {
        $total = 0;
        foreach ($items as $item) {
            $total += $item['price'];
        }
        return $total;
    }

    public function oldMethod(): string
    {
        return 'remove me';
    }
}
`;
    fs.writeFileSync('utils/refactorTest.php', original, 'utf-8');

    const result = await computePatch('utils/refactorTest.php', 'remove', 'oldMethod', '');
    console.log('ok:', result.ok);
    console.log('reason:', result.reason);
    console.log('viaGrammar:', result.viaGrammar);
    console.log('--- patched ---');
    console.log(result.patched);
    console.log('--- end patched ---');
}

main();