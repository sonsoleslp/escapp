const {playInterface, automaticallySetAttendance, getERState} = require("../helpers/utils");
const {getRetosSuperados, byRanking} = require("../helpers/analytics");
const {models} = require("../models");
const queries = require("../queries");
const {sendJoinTeam, sendStartTeam} = require("../helpers/sockets");


// GET /escapeRooms/:escapeRoomId/play
exports.play = (req, res, next) => playInterface("team", req, res, next);

// GET /escapeRooms/:escapeRoomId/project
exports.classInterface = (req, res, next) => playInterface("class", req, res, next);

exports.ranking = async (req, _res, next) => {
    let {turnoId} = req.params;

    try {
        const turno = await models.turno.findOne(queries.turno.myTurno(req.escapeRoom.id, req.session.user.id));

        if (turno) {
            turnoId = turno.id;
            if (turno.teams && turno.teams.length) {
                req.teamId = turno.teams[0].id;
            }
        }

        const teams = await models.team.findAll(queries.team.ranking(req.escapeRoom.id, turnoId));

        req.teams = getRetosSuperados(teams, req.escapeRoom.puzzles.length).sort(byRanking);
        next();
    } catch (e) {
        console.error(e);
        next();
    }
};

exports.finish = (req, res, next) => {
    req.finish = true;
    next();
};

exports.results = async (req, res) => {
    let {turnoId} = req.params;
    const {teamId} = req;

    if (!turnoId) {
        const turno = await models.turno.findOne(queries.turno.myTurno(req.escapeRoom.id, req.session.user.id));

        turnoId = turno.id;
    }

    if (turnoId) {
        res.render("escapeRooms/play/finish", {"escapeRoom": req.escapeRoom, "teams": req.teams, turnoId, teamId, "userId": req.session.user.id, "finish": req.finish});
    } else {
        res.redirect("back");
    }
};

// POST /escapeRooms/:escapeRoomId/play
exports.startPlaying = async (req, res) => {
    try {
        const {automaticAttendance, duration, hintLimit, puzzles, attendanceScore, scoreHintSuccess, scoreHintFail} = req.escapeRoom;
        const team = await models.team.findOne({
            "attributes": ["name", "id", "startTime"],
            "include": [
                {
                    "model": models.user,
                    "attributes": ["username"],
                    "as": "teamMembers",
                    "where": {"id": req.session.user.id}
                },
                {
                    "model": models.turno,
                    "attributes": ["id", "startTime"],
                    "where": {"escapeRoomId": req.escapeRoom.id}
                }
            ]
        });

        if (!team) {
            throw new Error();
        }
        const joinTeam = await automaticallySetAttendance(team, req.session.user.id, automaticAttendance);

        if (joinTeam) {
            const erState = await getERState(req.escapeRoom.id, team, duration, hintLimit, puzzles.length, true, attendanceScore, scoreHintSuccess, scoreHintFail, true);

            sendStartTeam(joinTeam.id, "OK", true, "PARTICIPANT", req.app.locals.i18n.escapeRoom.api.participationStart.PARTICIPANT, erState);
            sendJoinTeam(joinTeam.id, joinTeam.turno.id, erState.ranking);
        }
    } catch (err) {
        console.error(err);
        req.flash("error", err.message);
    }
    res.redirect(`/escapeRooms/${req.escapeRoom.id}/play`);
};
