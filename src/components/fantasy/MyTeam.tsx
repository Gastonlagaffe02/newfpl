import React, { useState, useEffect } from 'react';
import { Users, DollarSign, Trophy, Calendar, Edit, Save, X, Plus, Minus, Crown, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Player, Team, FantasyTeam, Roster } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';
import TeamCreation from './TeamCreation';
import toast from 'react-hot-toast';

interface PlayerWithTeam extends Player {
  team_name?: string;
}

interface RosterPlayer extends Roster {
  player: PlayerWithTeam;
}

export default function MyTeam() {
  const { user } = useAuth();
  const [fantasyTeam, setFantasyTeam] = useState<FantasyTeam | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerWithTeam[]>([]);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string>('');

  const TRANSFER_DEADLINE = new Date('2025-06-30');
  const canMakeChanges = new Date() <= TRANSFER_DEADLINE;

  useEffect(() => {
    if (user) {
      fetchFantasyTeam();
    }
  }, [user]);

  const fetchFantasyTeam = async () => {
    if (!user) return;

    try {
      // First check if user has a fantasy team
      const { data: teamData, error: teamError } = await supabase
        .from('fantasy_teams')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (teamError) {
        if (teamError.code === 'PGRST116') {
          // No team found - user needs to create one
          setFantasyTeam(null);
          setLoading(false);
          return;
        }
        throw teamError;
      }

      setFantasyTeam(teamData);

      // Fetch roster if team exists
      if (teamData) {
        await fetchRoster(teamData.fantasy_team_id);
      }
    } catch (error) {
      console.error('Error fetching fantasy team:', error);
      toast.error('Failed to fetch your team');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoster = async (fantasyTeamId: string) => {
    try {
      const { data, error } = await supabase
        .from('rosters')
        .select(`
          *,
          player:player_id (
            *,
            teams:team_id (
              name
            )
          )
        `)
        .eq('fantasy_team_id', fantasyTeamId)
        .order('squad_position');

      if (error) throw error;

      const rosterWithTeamNames = data?.map(rosterItem => ({
        ...rosterItem,
        player: {
          ...rosterItem.player,
          team_name: rosterItem.player?.teams?.name
        }
      })) || [];

      setRoster(rosterWithTeamNames);
    } catch (error) {
      console.error('Error fetching roster:', error);
      toast.error('Failed to fetch roster');
    }
  };

  const fetchAvailablePlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select(`
          *,
          teams:team_id (
            name
          )
        `)
        .order('name');

      if (error) throw error;

      const playersWithTeamNames = data?.map(player => ({
        ...player,
        team_name: player.teams?.name
      })) || [];

      setAvailablePlayers(playersWithTeamNames);
    } catch (error) {
      console.error('Error fetching players:', error);
      toast.error('Failed to fetch players');
    }
  };

  const getPlayersByPosition = (position: string, isStarter: boolean) => {
    return roster.filter(r => 
      r.player?.position === position && 
      r.is_starter === isStarter
    );
  };

  const getFormationCounts = () => {
    const starters = roster.filter(r => r.is_starter);
    return {
      defenders: starters.filter(r => r.player?.position === 'DEF').length,
      midfielders: starters.filter(r => r.player?.position === 'MID').length,
      forwards: starters.filter(r => r.player?.position === 'FWD').length,
    };
  };

  const handlePlayerReplace = async (rosterId: string, newPlayerId: string) => {
    try {
      const { error } = await supabase
        .from('rosters')
        .update({ player_id: newPlayerId })
        .eq('roster_id', rosterId);

      if (error) throw error;

      toast.success('Player replaced successfully');
      if (fantasyTeam) {
        await fetchRoster(fantasyTeam.fantasy_team_id);
      }
      setShowPlayerModal(false);
    } catch (error) {
      console.error('Error replacing player:', error);
      toast.error('Failed to replace player');
    }
  };

  const setCaptain = async (rosterId: string) => {
    try {
      // Remove captain from all players
      await supabase
        .from('rosters')
        .update({ is_captain: false })
        .eq('fantasy_team_id', fantasyTeam?.fantasy_team_id);

      // Set new captain
      const { error } = await supabase
        .from('rosters')
        .update({ is_captain: true })
        .eq('roster_id', rosterId);

      if (error) throw error;

      toast.success('Captain updated');
      if (fantasyTeam) {
        await fetchRoster(fantasyTeam.fantasy_team_id);
      }
    } catch (error) {
      console.error('Error setting captain:', error);
      toast.error('Failed to set captain');
    }
  };

  const setViceCaptain = async (rosterId: string) => {
    try {
      // Remove vice captain from all players
      await supabase
        .from('rosters')
        .update({ is_vice_captain: false })
        .eq('fantasy_team_id', fantasyTeam?.fantasy_team_id);

      // Set new vice captain
      const { error } = await supabase
        .from('rosters')
        .update({ is_vice_captain: true })
        .eq('roster_id', rosterId);

      if (error) throw error;

      toast.success('Vice captain updated');
      if (fantasyTeam) {
        await fetchRoster(fantasyTeam.fantasy_team_id);
      }
    } catch (error) {
      console.error('Error setting vice captain:', error);
      toast.error('Failed to set vice captain');
    }
  };

  const handleTeamCreated = () => {
    // Refresh the team data after creation
    fetchFantasyTeam();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // If user doesn't have a fantasy team, show team creation
  if (!fantasyTeam) {
    return <TeamCreation onTeamCreated={handleTeamCreated} />;
  }

  const formation = getFormationCounts();
  const starters = roster.filter(r => r.is_starter);
  const bench = roster.filter(r => !r.is_starter);
  const captain = roster.find(r => r.is_captain);
  const viceCaptain = roster.find(r => r.is_vice_captain);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Team Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{fantasyTeam.team_name}</h1>
            <p className="text-gray-600">Your Fantasy Soccer Team</p>
          </div>
          <div className="flex items-center space-x-4">
            {canMakeChanges && (
              <button
                onClick={() => {
                  setEditMode(!editMode);
                  if (!editMode) {
                    fetchAvailablePlayers();
                  }
                }}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center ${
                  editMode 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                    : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                }`}
              >
                {editMode ? (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Team
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Team Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-emerald-50 p-4 rounded-lg">
            <div className="flex items-center">
              <Trophy className="h-5 w-5 text-emerald-600 mr-2" />
              <div>
                <p className="text-sm text-emerald-600">Total Points</p>
                <p className="text-lg font-semibold text-emerald-900">{fantasyTeam.total_points}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center">
              <Calendar className="h-5 w-5 text-blue-600 mr-2" />
              <div>
                <p className="text-sm text-blue-600">This Gameweek</p>
                <p className="text-lg font-semibold text-blue-900">{fantasyTeam.gameweek_points}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 text-purple-600 mr-2" />
              <div>
                <p className="text-sm text-purple-600">Budget Left</p>
                <p className="text-lg font-semibold text-purple-900">£{fantasyTeam.budget_remaining}M</p>
              </div>
            </div>
          </div>
          
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="flex items-center">
              <Users className="h-5 w-5 text-orange-600 mr-2" />
              <div>
                <p className="text-sm text-orange-600">Rank</p>
                <p className="text-lg font-semibold text-orange-900">#{fantasyTeam.rank}</p>
              </div>
            </div>
          </div>
        </div>

        {!canMakeChanges && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 text-sm">
              Transfer deadline has passed. You can no longer make changes to your team.
            </p>
          </div>
        )}
      </div>

      {/* Formation and Pitch */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Formation: {formation.defenders}-{formation.midfielders}-{formation.forwards}
          </h2>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            {captain && (
              <div className="flex items-center">
                <Crown className="h-4 w-4 text-yellow-500 mr-1" />
                Captain: {captain.player?.name}
              </div>
            )}
            {viceCaptain && (
              <div className="flex items-center">
                <Star className="h-4 w-4 text-gray-500 mr-1" />
                Vice: {viceCaptain.player?.name}
              </div>
            )}
          </div>
        </div>

        {/* Soccer Pitch */}
        <div className="relative bg-gradient-to-b from-green-400 to-green-500 rounded-lg p-8 min-h-[500px]">
          {/* Pitch markings */}
          <div className="absolute inset-4 border-2 border-white rounded-lg opacity-50"></div>
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-white opacity-50"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white rounded-full opacity-50"></div>

          {/* Starting XI */}
          <div className="relative h-full flex flex-col justify-between py-8">
            {/* Goalkeeper */}
            <div className="flex justify-center">
              {getPlayersByPosition('GK', true).map((rosterPlayer) => (
                <PlayerCard
                  key={rosterPlayer.roster_id}
                  rosterPlayer={rosterPlayer}
                  editMode={editMode}
                  onReplace={() => {
                    setSelectedPosition('GK');
                    setShowPlayerModal(true);
                  }}
                  onSetCaptain={() => setCaptain(rosterPlayer.roster_id)}
                  onSetViceCaptain={() => setViceCaptain(rosterPlayer.roster_id)}
                />
              ))}
            </div>

            {/* Defenders */}
            <div className="flex justify-center space-x-4">
              {getPlayersByPosition('DEF', true).map((rosterPlayer) => (
                <PlayerCard
                  key={rosterPlayer.roster_id}
                  rosterPlayer={rosterPlayer}
                  editMode={editMode}
                  onReplace={() => {
                    setSelectedPosition('DEF');
                    setShowPlayerModal(true);
                  }}
                  onSetCaptain={() => setCaptain(rosterPlayer.roster_id)}
                  onSetViceCaptain={() => setViceCaptain(rosterPlayer.roster_id)}
                />
              ))}
            </div>

            {/* Midfielders */}
            <div className="flex justify-center space-x-4">
              {getPlayersByPosition('MID', true).map((rosterPlayer) => (
                <PlayerCard
                  key={rosterPlayer.roster_id}
                  rosterPlayer={rosterPlayer}
                  editMode={editMode}
                  onReplace={() => {
                    setSelectedPosition('MID');
                    setShowPlayerModal(true);
                  }}
                  onSetCaptain={() => setCaptain(rosterPlayer.roster_id)}
                  onSetViceCaptain={() => setViceCaptain(rosterPlayer.roster_id)}
                />
              ))}
            </div>

            {/* Forwards */}
            <div className="flex justify-center space-x-4">
              {getPlayersByPosition('FWD', true).map((rosterPlayer) => (
                <PlayerCard
                  key={rosterPlayer.roster_id}
                  rosterPlayer={rosterPlayer}
                  editMode={editMode}
                  onReplace={() => {
                    setSelectedPosition('FWD');
                    setShowPlayerModal(true);
                  }}
                  onSetCaptain={() => setCaptain(rosterPlayer.roster_id)}
                  onSetViceCaptain={() => setViceCaptain(rosterPlayer.roster_id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bench</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {bench.map((rosterPlayer) => (
            <div key={rosterPlayer.roster_id} className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  rosterPlayer.player?.position === 'GK' ? 'bg-purple-100 text-purple-800' :
                  rosterPlayer.player?.position === 'DEF' ? 'bg-blue-100 text-blue-800' :
                  rosterPlayer.player?.position === 'MID' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-orange-100 text-orange-800'
                }`}>
                  {rosterPlayer.player?.position}
                </span>
                {editMode && canMakeChanges && (
                  <button
                    onClick={() => {
                      setSelectedPosition(rosterPlayer.player?.position || '');
                      setShowPlayerModal(true);
                    }}
                    className="text-emerald-600 hover:text-emerald-700"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="font-medium text-gray-900">{rosterPlayer.player?.name}</div>
              <div className="text-sm text-gray-500">{rosterPlayer.player?.team_name}</div>
              <div className="text-sm text-gray-600 mt-1">£{rosterPlayer.player?.price}M</div>
            </div>
          ))}
        </div>
      </div>

      {/* Player Replacement Modal */}
      {showPlayerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Replace {selectedPosition} Player</h3>
              <button onClick={() => setShowPlayerModal(false)}>
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availablePlayers
                .filter(player => player.position === selectedPosition)
                .map((player) => (
                  <div key={player.player_id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div>
                      <div className="font-medium">{player.name}</div>
                      <div className="text-sm text-gray-500">{player.team_name} • £{player.price}M</div>
                    </div>
                    <button
                      onClick={() => handlePlayerReplace('', player.player_id)}
                      className="bg-emerald-600 text-white px-3 py-1 rounded hover:bg-emerald-700"
                    >
                      Select
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Player Card Component
interface PlayerCardProps {
  rosterPlayer: RosterPlayer;
  editMode: boolean;
  onReplace: () => void;
  onSetCaptain: () => void;
  onSetViceCaptain: () => void;
}

function PlayerCard({ rosterPlayer, editMode, onReplace, onSetCaptain, onSetViceCaptain }: PlayerCardProps) {
  return (
    <div className="relative bg-white rounded-lg p-3 shadow-md min-w-[120px] text-center">
      {/* Captain/Vice Captain badges */}
      {rosterPlayer.is_captain && (
        <div className="absolute -top-2 -right-2 bg-yellow-500 text-white rounded-full p-1">
          <Crown className="h-3 w-3" />
        </div>
      )}
      {rosterPlayer.is_vice_captain && (
        <div className="absolute -top-2 -right-2 bg-gray-500 text-white rounded-full p-1">
          <Star className="h-3 w-3" />
        </div>
      )}

      <div className="text-xs font-medium text-gray-600 mb-1">
        {rosterPlayer.player?.position}
      </div>
      <div className="font-semibold text-sm text-gray-900 mb-1">
        {rosterPlayer.player?.name}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        {rosterPlayer.player?.team_name}
      </div>
      <div className="text-xs text-gray-600">
        £{rosterPlayer.player?.price}M
      </div>

      {editMode && (
        <div className="mt-2 flex justify-center space-x-1">
          <button
            onClick={onReplace}
            className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs hover:bg-emerald-200"
          >
            Replace
          </button>
          <button
            onClick={onSetCaptain}
            className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs hover:bg-yellow-200"
          >
            C
          </button>
          <button
            onClick={onSetViceCaptain}
            className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-200"
          >
            VC
          </button>
        </div>
      )}
    </div>
  );
}