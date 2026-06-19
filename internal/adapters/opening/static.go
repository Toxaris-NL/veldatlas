package opening

import (
    "fmt"
    "os"
    "sort"
    "strings"
    "sync"

    chess "github.com/corentings/chess/v2"

    "github.com/Toxaris-Nl/veldatlas/internal/domain"
)

// StaticProvider performs real Polyglot lookup against a .bin book file.
// The lookup flow is:
//  1. lazily load the book from disk
//  2. convert the current snapshot FEN to a Polyglot/Zobrist hash
//  3. find matching book moves
//  4. decode them to UCI and calculate percentages from weights
type StaticProvider struct {
    path string

    once sync.Once
    book *chess.PolyglotBook
    err  error
}

func NewStaticProvider(bookPath string) *StaticProvider {
    return &StaticProvider{path: strings.TrimSpace(bookPath)}
}

func (p *StaticProvider) Recommend(snapshot domain.Snapshot) ([]domain.BookRecommendation, error) {
    if p.path == "" {
        return []domain.BookRecommendation{}, nil
    }
    if strings.TrimSpace(snapshot.FEN) == "" {
        return []domain.BookRecommendation{}, nil
    }

    if err := p.loadBook(); err != nil {
        return nil, err
    }

    hash, err := positionHashFromFEN(snapshot.FEN)
    if err != nil {
        return nil, err
    }

    entries := p.book.FindMoves(hash)
    if len(entries) == 0 {
        return []domain.BookRecommendation{}, nil
    }

    totalWeight := 0
    for _, entry := range entries {
        totalWeight += int(entry.Weight)
    }
    if totalWeight <= 0 {
        totalWeight = 1
    }

    out := make([]domain.BookRecommendation, 0, len(entries))
    for _, entry := range entries {
        move := polyglotMoveToUCI(entry.Move)
        percentage := (float64(entry.Weight) / float64(totalWeight)) * 100.0

        out = append(out, domain.BookRecommendation{
            Move:       move,
            Weight:     int(entry.Weight),
            Percentage: percentage,
            Source:     "polyglot",
        })
    }

    sort.Slice(out, func(i, j int) bool {
        if out[i].Weight != out[j].Weight {
            return out[i].Weight > out[j].Weight
        }
        return out[i].Move < out[j].Move
    })

    return out, nil
}

func (p *StaticProvider) loadBook() error {
    p.once.Do(func() {
        f, err := os.Open(p.path)
        if err != nil {
            p.err = fmt.Errorf("open polyglot book %q: %w", p.path, err)
            return
        }
        defer f.Close()

        book, err := chess.LoadFromReader(f)
        if err != nil {
            p.err = fmt.Errorf("load polyglot book %q: %w", p.path, err)
            return
        }

        p.book = book
    })
    return p.err
}

// positionHashFromFEN converts a FEN into the 64-bit Polyglot/Zobrist key.
// If your pinned corentings/chess version exposes a slightly different
// exported hash method, adjust only this helper.
func positionHashFromFEN(fen string) (uint64, error) {
    fenFunc, err := chess.FEN(fen)
    if err != nil {
        return 0, fmt.Errorf("cannot build position from FEN: %w", err)
    }
    pos := chess.NewGame(fenFunc).Position()
    if pos == nil {
        return 0, fmt.Errorf("cannot build position from FEN")
    }
    hasher := chess.NewZobristHasher()
    hashStr, err := hasher.HashPosition(pos.String())
    if err != nil {
        return 0, err
    }
    return chess.ZobristHashToUint64(hashStr), nil
}

// polyglotMoveToUCI converts a 16-bit Polyglot move into a UCI move string.
func polyglotMoveToUCI(raw uint16) string {
    mv := chess.DecodeMove(raw)

    from := squareName(mv.FromFile, mv.FromRank)
    to := squareName(mv.ToFile, mv.ToRank)

    promo := ""
    switch mv.Promotion {
    case 1:
        promo = "n"
    case 2:
        promo = "b"
    case 3:
        promo = "r"
    case 4:
        promo = "q"
    }

    // Defensive normalization for castling representations.
    if mv.CastlingMove {
        switch from + to {
        case "e1h1":
            to = "g1"
        case "e1a1":
            to = "c1"
        case "e8h8":
            to = "g8"
        case "e8a8":
            to = "c8"
        }
    }

    return from + to + promo
}

func squareName(file, rank int) string {
    return string([]byte{
        byte('a' + file),
        byte('1' + rank),
    })
}