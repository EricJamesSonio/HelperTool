<?php

namespace App\Utils;

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