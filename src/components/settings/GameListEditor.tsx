import React, { useState } from 'react';

interface GameListEditorProps {
    games: string[];
    onUpdate: (games: string[]) => void;
}

export function GameListEditor({ games = [], onUpdate }: GameListEditorProps) {
    const [newGame, setNewGame] = useState('');
    const [expanded, setExpanded] = useState(false);

    const addGame = () => {
        const name = newGame.trim().toLowerCase();
        if (name && !games.includes(name)) {
            onUpdate([...games, name]);
            setNewGame('');
        }
    };

    return (
        <div>
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-violet-500 hover:underline">
                {expanded ? '收起' : `查看全部 (${games.length})`}
            </button>
            {expanded && (
                <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newGame}
                            onChange={(e) => setNewGame(e.target.value)}
                            placeholder="game.exe"
                            className="flex-1 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                            onKeyDown={(e) => e.key === 'Enter' && addGame()}
                        />
                        <button onClick={addGame} className="px-3 py-1.5 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600">添加</button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                        {games.slice(0, 15).map(g => (
                            <div key={g} className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded text-xs">
                                <span className="text-slate-600">{g}</span>
                                <button onClick={() => onUpdate(games.filter(x => x !== g))} className="text-slate-400 hover:text-red-500">×</button>
                            </div>
                        ))}
                        {games.length > 15 && <div className="text-xs text-slate-400 text-center">...还有 {games.length - 15} 个</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
